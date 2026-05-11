/**
 * WeatherAppStack
 *
 * Single-stack layout (all us-east-1 — required for CloudFront ACM certs):
 *
 *   S3 Bucket (origin)
 *     └── CloudFront Distribution
 *           ├── /api/anthropic/* → Lambda Function URL (streaming proxy)
 *           └── /*              → S3 (SPA — 404 → index.html / 200)
 *
 *   Secrets Manager
 *     └── aether/anthropic-api-key  (you populate this after deploy)
 *
 *   IAM OIDC provider + Role
 *     └── GitHub Actions can assume this role for S3 sync + CF invalidation
 */

import * as cdk from 'aws-cdk-lib';
import {
  aws_s3               as s3,
  aws_s3_deployment    as s3deploy,
  aws_cloudfront       as cf,
  aws_cloudfront_origins as origins,
  aws_lambda           as lambda,
  aws_iam              as iam,
  aws_secretsmanager   as sm,
  aws_certificatemanager as acm,
  aws_route53          as r53,
  aws_route53_targets  as r53targets,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'node:path';

export interface WeatherAppStackProps extends cdk.StackProps {
  githubOwner: string;
  githubRepo:  string;
  /** If provided, a custom domain + ACM cert are created. */
  domainName?: string;
}

export class WeatherAppStack extends cdk.Stack {
  /** The CloudFront URL (or custom domain) — printed after deploy. */
  readonly appUrl: string;
  /** S3 bucket name — printed after deploy (needed for GitHub Actions). */
  readonly bucketName: string;
  /** CloudFront distribution ID — needed for cache invalidation. */
  readonly distributionId: string;

  constructor(scope: Construct, id: string, props: WeatherAppStackProps) {
    super(scope, id, props);

    // ─── Secrets Manager ──────────────────────────────────────────────────────
    // Store the Anthropic API key here. After `cdk deploy`, set the value via:
    //   aws secretsmanager put-secret-value \
    //     --secret-id aether/anthropic-api-key \
    //     --secret-string '{"apiKey":"sk-ant-..."}'
    const anthropicSecret = new sm.Secret(this, 'AnthropicApiKey', {
      secretName: 'aether/anthropic-api-key',
      description: 'Anthropic API key for the Aether Weather AI briefing proxy.',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ apiKey: 'REPLACE_AFTER_DEPLOY' }),
        generateStringKey: '_unused',   // placeholder — we overwrite the whole secret
      },
    });

    // Reference the Kalshi secret created manually in Secrets Manager.
    // Name: aether/kalshi-private-key  (already populated by the user)
    const kalshiSecret = sm.Secret.fromSecretNameV2(this, 'KalshiPrivateKey', 'aether/kalshi-private-key');

    // ─── Lambda — streaming Anthropic proxy ───────────────────────────────────
    // Pre-built by `cd lambda/proxy && npx esbuild index.ts --bundle ...`.
    // The dist/ directory is committed and deployed as-is — no Docker needed.
    const proxyFn = new lambda.Function(this, 'AnthropicProxy', {
      runtime:     lambda.Runtime.NODEJS_20_X,
      handler:     'index.handler',
      code:        lambda.Code.fromAsset(path.join(__dirname, '../../lambda/proxy/dist')),
      // Lambda streaming timeout can be up to 15 min; 60s is plenty for Claude.
      timeout:     cdk.Duration.seconds(60),
      memorySize:  256,
      description: 'Streaming proxy: forwards requests to Anthropic and pipes SSE back.',
      environment: {
        ANTHROPIC_SECRET_ARN: anthropicSecret.secretArn,
        // Pass the secret NAME, not .secretArn. fromSecretNameV2 synthesises an
        // ARN without the random 6-char suffix Secrets Manager appends, so
        // GetSecretValue({ SecretId: partialArn }) fails every cold start.
        // Using the name directly always resolves correctly.
        KALSHI_SECRET_ARN:    'aether/kalshi-private-key',
        // Restrict responses to our domain. GitHub Actions sets this
        // automatically during deploy via an env var override if desired.
        ALLOWED_ORIGIN: props.domainName ? `https://${props.domainName}` : '*',
      },
    });
    anthropicSecret.grantRead(proxyFn);
    kalshiSecret.grantRead(proxyFn);

    // Lambda Function URL with response streaming enabled.
    const proxyUrl = proxyFn.addFunctionUrl({
      authType:    lambda.FunctionUrlAuthType.NONE,
      invokeMode:  lambda.InvokeMode.RESPONSE_STREAM,
      cors: {
        allowedOrigins: ['*'],       // CloudFront adds real CORS headers; Lambda is internal
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['content-type', 'anthropic-version', 'anthropic-beta'],
      },
    });

    // ─── S3 — static site bucket ──────────────────────────────────────────────
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess:  s3.BlockPublicAccess.BLOCK_ALL,
      encryption:         s3.BucketEncryption.S3_MANAGED,
      removalPolicy:      cdk.RemovalPolicy.RETAIN,   // don't nuke the bucket on stack delete
      autoDeleteObjects:  false,
    });

    // OAC — the recommended way to give CloudFront access to private S3 buckets.
    const oac = new cf.S3OriginAccessControl(this, 'OAC', {
      description: 'Aether Weather site OAC',
    });

    // ─── ACM certificate (only if a custom domain is provided) ───────────────
    let certificate: acm.ICertificate | undefined;
    let hostedZone: r53.IHostedZone | undefined;
    if (props.domainName) {
      hostedZone = r53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: props.domainName.split('.').slice(-2).join('.'),
      });
      certificate = new acm.Certificate(this, 'Certificate', {
        domainName: props.domainName,
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });
    }

    // ─── CloudFront distribution ──────────────────────────────────────────────
    // Parse the Lambda Function URL hostname for the custom origin.
    const lambdaOriginDomain = cdk.Fn.select(2, cdk.Fn.split('/', proxyUrl.url));

    const distribution = new cf.Distribution(this, 'Distribution', {
      comment:       'Aether Weather',
      defaultRootObject: 'index.html',
      domainNames:   props.domainName ? [props.domainName] : undefined,
      certificate,
      httpVersion:   cf.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cf.SecurityPolicyProtocol.TLS_V1_2_2021,

      defaultBehavior: {
        // SPA — serve index.html for every path and let React Router handle it.
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket, { originAccessControl: oac }),
        viewerProtocolPolicy:  cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy:           cf.CachePolicy.CACHING_DISABLED,   // app shell changes often
        allowedMethods:        cf.AllowedMethods.ALLOW_GET_HEAD,
        compress:              true,
      },

      additionalBehaviors: {
        // /api/anthropic/* → streaming Lambda proxy.
        '/api/anthropic/*': {
          origin: new origins.HttpOrigin(lambdaOriginDomain, {
            protocolPolicy:    cf.OriginProtocolPolicy.HTTPS_ONLY,
            originPath:        '',
          }),
          viewerProtocolPolicy:  cf.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy:           cf.CachePolicy.CACHING_DISABLED,
          allowedMethods:        cf.AllowedMethods.ALLOW_ALL,
          originRequestPolicy:   cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy:  cf.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
        },
        // /api/kalshi/* → same Lambda proxy (handles Kalshi market data).
        '/api/kalshi/*': {
          origin: new origins.HttpOrigin(lambdaOriginDomain, {
            protocolPolicy: cf.OriginProtocolPolicy.HTTPS_ONLY,
            originPath:     '',
          }),
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy:          cf.CachePolicy.CACHING_DISABLED,
          allowedMethods:       cf.AllowedMethods.ALLOW_GET_HEAD,
          originRequestPolicy:  cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: cf.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
        },
      },

      // Redirect 403/404 from S3 to index.html so React Router handles deep links.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.seconds(0) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.seconds(0) },
      ],
    });

    // Route 53 A/AAAA records for the custom domain.
    if (hostedZone && props.domainName) {
      new r53.ARecord(this, 'AliasA', {
        zone:       hostedZone,
        recordName: props.domainName,
        target:     r53.RecordTarget.fromAlias(new r53targets.CloudFrontTarget(distribution)),
      });
      new r53.AaaaRecord(this, 'AliasAAAA', {
        zone:       hostedZone,
        recordName: props.domainName,
        target:     r53.RecordTarget.fromAlias(new r53targets.CloudFrontTarget(distribution)),
      });
    }

    // ─── GitHub Actions OIDC ──────────────────────────────────────────────────
    // Gives GitHub Actions a short-lived token (no stored AWS secrets needed).
    // Scope: only pushes to the specified repo can assume this role.
    const githubProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName:     `aether-github-deploy-${this.region}`,
      description:  'Role assumed by GitHub Actions to deploy Aether Weather.',
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub':
            `repo:${props.githubOwner}/${props.githubRepo}:*`,
        },
      }),
    });

    // What GitHub Actions needs:
    siteBucket.grantReadWrite(deployRole);
    siteBucket.grantDelete(deployRole);
    deployRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions:   ['cloudfront:CreateInvalidation'],
      resources: [
        `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
      ],
    }));

    // ─── Outputs ──────────────────────────────────────────────────────────────
    this.appUrl        = props.domainName ? `https://${props.domainName}` : `https://${distribution.distributionDomainName}`;
    this.bucketName    = siteBucket.bucketName;
    this.distributionId = distribution.distributionId;

    new cdk.CfnOutput(this, 'AppUrl',          { value: this.appUrl,         description: 'Your app URL' });
    new cdk.CfnOutput(this, 'BucketName',      { value: this.bucketName,     description: 'S3 bucket — set BUCKET_NAME in GitHub secrets' });
    new cdk.CfnOutput(this, 'DistributionId',  { value: this.distributionId, description: 'CloudFront ID — set CF_DISTRIBUTION_ID in GitHub secrets' });
    new cdk.CfnOutput(this, 'DeployRoleArn',   { value: deployRole.roleArn,  description: 'IAM role ARN — set AWS_DEPLOY_ROLE_ARN in GitHub secrets' });
    new cdk.CfnOutput(this, 'SecretArn',       { value: anthropicSecret.secretArn, description: 'Run: aws secretsmanager put-secret-value ...' });
  }
}
