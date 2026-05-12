/**
 * Aether Weather — Anthropic streaming proxy + Kalshi market data proxy
 *
 * Receives a request from the frontend, fetches the Anthropic API key from
 * Secrets Manager (cached after the first cold start), injects it as the
 * `x-api-key` header, and pipes Anthropic's SSE response stream back to the
 * caller — preserving all the server-sent events so the browser can still use
 * the Anthropic SDK in streaming mode.
 *
 * Also handles /api/kalshi/* by fetching from the Kalshi REST API with RSA
 * request signing. Degrades gracefully when KALSHI_SECRET_ARN is not set.
 *
 * CloudFront routes /api/anthropic/* and /api/kalshi/* here.
 *
 * Security:
 *   • API keys never leave AWS — they live in Secrets Manager, flow
 *     through Lambda memory only, and are never returned to the client.
 *   • The Lambda Function URL is NONE auth (public), but is only reachable
 *     through CloudFront, which enforces our ALLOWED_ORIGIN restriction.
 *   • Rate limiting and WAF can be layered on CloudFront in the future.
 */

import crypto from 'node:crypto';
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

// ─── Kalshi credentials ───────────────────────────────────────────────────────

interface KalshiCredentials {
  keyId: string;
  privateKey: string;
}

let cachedKalshiCreds: KalshiCredentials | null | undefined = undefined; // undefined = unchecked

async function getKalshiCredentials(): Promise<KalshiCredentials | null> {
  // Already fetched (or confirmed absent) this cold start.
  if (cachedKalshiCreds !== undefined) return cachedKalshiCreds;

  const secretArn = process.env.KALSHI_SECRET_ARN;
  if (!secretArn) {
    cachedKalshiCreds = null;
    return null;
  }

  try {
    const res = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const parsed = JSON.parse(res.SecretString ?? '{}') as { keyId?: string; privateKey?: string };
    if (!parsed.keyId || !parsed.privateKey) {
      console.warn('[proxy] Kalshi secret missing keyId or privateKey fields.');
      cachedKalshiCreds = null;
      return null;
    }
    cachedKalshiCreds = { keyId: parsed.keyId, privateKey: parsed.privateKey };
    return cachedKalshiCreds;
  } catch (err) {
    console.error('[proxy] Failed to fetch Kalshi credentials:', err);
    cachedKalshiCreds = null;
    return null;
  }
}

// ─── Kalshi RSA-SHA256 request signing ────────────────────────────────────────

function signKalshi(method: string, path: string, ts: string, privateKey: string): string {
  const msg = ts + method.toUpperCase() + path;
  return crypto.createSign('RSA-SHA256').update(msg).end().sign(privateKey, 'base64');
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
const ANTHROPIC_ALLOWED_METHODS = new Set(['POST', 'OPTIONS']);
const ANTHROPIC_HOST             = 'api.anthropic.com';
const KALSHI_HOST                = 'trading-api.kalshi.com';

function rejectStream(responseStream: NodeJS.WritableStream, statusCode: number, message: string) {
  const body = JSON.stringify({ error: message });
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode,
    headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) },
  });
  stream.end(body);
}

function sendJson(responseStream: NodeJS.WritableStream, statusCode: number, payload: unknown, origin: string) {
  const body = JSON.stringify(payload);
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode,
    headers: {
      'content-type':                'application/json',
      'content-length':              String(Buffer.byteLength(body)),
      'access-control-allow-origin': origin,
      'cache-control':               'no-cache',
    },
  });
  stream.end(body);
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export const handler = awslambda.streamifyResponse(
  async (event: LambdaEvent, responseStream: NodeJS.WritableStream): Promise<void> => {
    const method = event.requestContext.http.method.toUpperCase();
    const origin = process.env.ALLOWED_ORIGIN ?? '*';

    // ── Route detection ──────────────────────────────────────────────────────
    const isKalshi    = event.rawPath.startsWith('/api/kalshi');
    const isAnthropic = event.rawPath.startsWith('/api/anthropic');

    // ── CORS preflight ───────────────────────────────────────────────────────
    if (method === 'OPTIONS') {
      const stream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 204,
        headers: {
          'access-control-allow-origin':  origin,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, anthropic-version, anthropic-beta, x-request-id',
          'access-control-max-age':       '86400',
        },
      });
      stream.end();
      return;
    }

    // ── Kalshi market data (GET only, read-only) ──────────────────────────────
    if (isKalshi) {
      if (method !== 'GET') {
        rejectStream(responseStream, 405, 'Only GET is supported for Kalshi market data.');
        return;
      }

      // Wrap the entire Kalshi flow so any signing / network error degrades
      // gracefully to an empty markets list instead of a 502.
      try {
        const creds = await getKalshiCredentials();

        if (!creds) {
          // Graceful degradation — Kalshi not configured.
          sendJson(responseStream, 200, { markets: [] }, origin);
          return;
        }

        // Strip /api/kalshi prefix → forward to trading-api.kalshi.com
        const kalshiPath = event.rawPath.replace(/^\/api\/kalshi/, '') || '/trade-api/v2/markets';
        const query      = event.rawQueryString ? `?${event.rawQueryString}` : '';
        const fullPath   = kalshiPath + query;

        const ts = String(Date.now());

        // Normalise the private key to PEM format. The key stored in Secrets
        // Manager may be raw base64 (no headers) or a full PEM string. Node's
        // crypto.createSign requires proper PEM headers — add them if absent.
        let privateKey = creds.privateKey.trim();
        if (!privateKey.startsWith('-----')) {
          // Strip any whitespace / newlines that got into the base64 blob, then
          // wrap in PKCS#1 headers so Node's crypto stack can parse it.
          const b64 = privateKey.replace(/\s+/g, '');
          privateKey = `-----BEGIN RSA PRIVATE KEY-----\n${b64}\n-----END RSA PRIVATE KEY-----`;
        }

        const signature = signKalshi('GET', kalshiPath, ts, privateKey);

        const requestOptions: https.RequestOptions = {
          hostname: KALSHI_HOST,
          path:     fullPath,
          method:   'GET',
          headers: {
            'kalshi-access-key':       creds.keyId,
            'kalshi-access-signature': signature,
            'kalshi-access-timestamp': ts,
            'content-type':            'application/json',
            'user-agent':              'aether-weather-proxy/1.0',
          },
        };

        await new Promise<void>((resolve, reject) => {
          const req = https.request(requestOptions, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
              const raw = Buffer.concat(chunks).toString('utf8');
              let parsed: unknown;
              try { parsed = JSON.parse(raw); } catch { parsed = { markets: [] }; }
              sendJson(responseStream, res.statusCode ?? 200, parsed, origin);
              resolve();
            });
            res.on('error', reject);
          });
          req.on('error', reject);
          req.end();
        });
      } catch (err) {
        console.error('[proxy] Kalshi handler error:', err);
        sendJson(responseStream, 200, { markets: [] }, origin);
      }
      return;
    }

    // ── Anthropic streaming proxy ─────────────────────────────────────────────
    if (!isAnthropic) {
      rejectStream(responseStream, 404, 'Unknown proxy path.');
      return;
    }

    if (!ANTHROPIC_ALLOWED_METHODS.has(method)) {
      rejectStream(responseStream, 405, `Method ${method} not allowed.`);
      return;
    }

    // Strip our proxy prefix: /api/anthropic/v1/messages → /v1/messages
    const anthropicPath = event.rawPath.replace(/^\/api\/anthropic/, '') || '/v1/messages';
    const query         = event.rawQueryString ? `?${event.rawQueryString}` : '';

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
