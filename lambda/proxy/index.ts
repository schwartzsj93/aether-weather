/**
 * Aether Weather — Anthropic streaming proxy
 *
 * Receives a request from the frontend, fetches the Anthropic API key from
 * Secrets Manager (cached after the first cold start), injects it as the
 * `x-api-key` header, and pipes Anthropic's SSE response stream back to the
 * caller — preserving all the server-sent events so the browser can still use
 * the Anthropic SDK in streaming mode.
 *
 * CloudFront routes /api/anthropic/* here; the function strips the prefix and
 * forwards to https://api.anthropic.com/v1/... intact.
 *
 * Security:
 *   • The API key never leaves AWS — it lives in Secrets Manager, flows
 *     through Lambda memory only, and is never returned to the client.
 *   • The Lambda Function URL is NONE auth (public), but is only reachable
 *     through CloudFront, which enforces our ALLOWED_ORIGIN restriction.
 *   • Rate limiting and WAF can be layered on CloudFront in the future.
 */

import https from 'node:https';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

// ─── Secrets Manager ──────────────────────────────────────────────────────────
// Re-use the client across warm invocations (one per execution environment).
const sm = new SecretsManagerClient({});
let cachedApiKey: string | null = null;

async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  const secretArn = process.env.ANTHROPIC_SECRET_ARN;
  if (!secretArn) throw new Error('ANTHROPIC_SECRET_ARN env var is not set.');

  const res = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const parsed = JSON.parse(res.SecretString ?? '{}') as { apiKey?: string };
  if (!parsed.apiKey) throw new Error('Secret does not contain an "apiKey" field.');

  cachedApiKey = parsed.apiKey;
  return cachedApiKey;
}

// ─── Lambda streaming runtime types ───────────────────────────────────────────
// These types are provided by the Lambda Node runtime — not an npm package.
interface StreamMetadata {
  statusCode: number;
  headers: Record<string, string>;
}

interface AwsLambdaGlobal {
  streamifyResponse: (
    fn: (
      event: LambdaEvent,
      responseStream: NodeJS.WritableStream,
      context: unknown,
    ) => Promise<void>,
  ) => unknown;
  HttpResponseStream: {
    from(
      stream: NodeJS.WritableStream,
      metadata: StreamMetadata,
    ): NodeJS.WritableStream;
  };
}

interface LambdaEvent {
  requestContext: { http: { method: string } };
  rawPath: string;
  rawQueryString?: string;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

declare const awslambda: AwsLambdaGlobal;

// ─── Request validation ───────────────────────────────────────────────────────
const ALLOWED_METHODS = new Set(['POST', 'OPTIONS']);
const ANTHROPIC_HOST  = 'api.anthropic.com';

function rejectStream(responseStream: NodeJS.WritableStream, statusCode: number, message: string) {
  const body = JSON.stringify({ error: message });
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode,
    headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) },
  });
  stream.end(body);
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export const handler = awslambda.streamifyResponse(
  async (event: LambdaEvent, responseStream: NodeJS.WritableStream): Promise<void> => {
    const method = event.requestContext.http.method.toUpperCase();
    const origin = process.env.ALLOWED_ORIGIN ?? '*';

    // Handle CORS preflight.
    if (method === 'OPTIONS') {
      const stream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 204,
        headers: {
          'access-control-allow-origin':  origin,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, anthropic-version, anthropic-beta, x-request-id',
          'access-control-max-age':       '86400',
        },
      });
      stream.end();
      return;
    }

    if (!ALLOWED_METHODS.has(method)) {
      rejectStream(responseStream, 405, `Method ${method} not allowed.`);
      return;
    }

    // Strip our proxy prefix: /api/anthropic/v1/messages → /v1/messages
    const anthropicPath = event.rawPath.replace(/^\/api\/anthropic/, '') || '/v1/messages';
    const query = event.rawQueryString ? `?${event.rawQueryString}` : '';

    let apiKey: string;
    try {
      apiKey = await getApiKey();
    } catch (err) {
      console.error('[proxy] Failed to fetch API key:', err);
      rejectStream(responseStream, 500, 'Failed to retrieve credentials.');
      return;
    }

    // Decode body.
    const bodyBuffer: Buffer | null = event.body
      ? event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : Buffer.from(event.body, 'utf8')
      : null;

    const requestOptions: https.RequestOptions = {
      hostname: ANTHROPIC_HOST,
      path:     anthropicPath + query,
      method,
      headers: {
        'x-api-key':          apiKey,
        'anthropic-version':  '2023-06-01',
        'content-type':       'application/json',
        'user-agent':         'aether-weather-proxy/1.0',
        // Pass through any anthropic-beta header from the client.
        ...(event.headers?.['anthropic-beta']
          ? { 'anthropic-beta': event.headers['anthropic-beta'] }
          : {}),
        ...(bodyBuffer
          ? { 'content-length': String(bodyBuffer.byteLength) }
          : {}),
      },
    };

    return new Promise<void>((resolve, reject) => {
      const req = https.request(requestOptions, (res) => {
        // Pipe Anthropic's response (SSE or JSON) back through our stream.
        const outStream = awslambda.HttpResponseStream.from(responseStream, {
          statusCode: res.statusCode ?? 200,
          headers: {
            'content-type':                res.headers['content-type']  ?? 'application/json',
            'access-control-allow-origin': origin,
            'cache-control':               'no-cache',
            // Preserve x-request-id for client-side logging/debugging.
            ...(res.headers['x-request-id']
              ? { 'x-request-id': res.headers['x-request-id'] as string }
              : {}),
          },
        });

        res.pipe(outStream, { end: true });

        outStream.on('finish', resolve);
        outStream.on('error',  reject);
        res.on('error',        reject);
      });

      req.on('error', reject);
      if (bodyBuffer) req.write(bodyBuffer);
      req.end();
    });
  },
);
