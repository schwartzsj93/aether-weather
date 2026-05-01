# Deploying Aether Weather to AWS

## Architecture

```
Browser ──► CloudFront ──► S3 (dist/)           Static PWA
                     └──► Lambda Function URL   /api/anthropic/* streaming proxy
                                  │
                                  └──► Secrets Manager (Anthropic API key)
```

GitHub Actions deploys the frontend (S3 sync + CloudFront invalidation) on every
push to `main`. Infrastructure changes (CDK) only redeploy when `infrastructure/`
or `lambda/` files change.

---

## One-time setup (do this once, from your machine)

### 1. Prerequisites

```bash
# AWS CLI
brew install awscli
aws configure   # enter your Access Key, Secret, region=us-east-1, output=json

# AWS CDK
npm install -g aws-cdk

# ts-node (CDK bin needs it)
npm install -g ts-node
```

Confirm you're logged in:
```bash
aws sts get-caller-identity
```

### 2. Bootstrap CDK (once per AWS account/region)

```bash
cd infrastructure
npm install
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
```

Replace `YOUR_ACCOUNT_ID` with your 12-digit AWS account number (from `aws sts get-caller-identity`).

### 3. Deploy the stack

```bash
# From the infrastructure/ directory:
cdk deploy \
  -c githubOwner=YOUR_GITHUB_USERNAME \
  -c githubRepo=YOUR_REPO_NAME
```

To use a custom domain (must already have a Route 53 hosted zone):
```bash
cdk deploy \
  -c githubOwner=YOUR_GITHUB_USERNAME \
  -c githubRepo=YOUR_REPO_NAME \
  -c domainName=weather.yourapp.com
```

After deploy completes, CDK prints the output values you need — copy them:
```
Outputs:
  AetherWeather.AppUrl          = https://xxxxxx.cloudfront.net
  AetherWeather.BucketName      = aetherweather-sitebucket-xxxx
  AetherWeather.DistributionId  = EXXXXXXXXXXXX
  AetherWeather.DeployRoleArn   = arn:aws:iam::123456789:role/aether-github-deploy-us-east-1
  AetherWeather.SecretArn       = arn:aws:secretsmanager:us-east-1:...
```

### 4. Store the Anthropic API key

```bash
aws secretsmanager put-secret-value \
  --secret-id aether/anthropic-api-key \
  --secret-string '{"apiKey":"sk-ant-YOUR_KEY_HERE"}'
```

Get your key at https://console.anthropic.com → API Keys.

### 5. Add GitHub Actions secrets

In your GitHub repo → Settings → Secrets and variables → Actions → New secret:

| Secret name              | Value (from CDK outputs above)    |
|--------------------------|-----------------------------------|
| `AWS_DEPLOY_ROLE_ARN`    | `AetherWeather.DeployRoleArn`     |
| `BUCKET_NAME`            | `AetherWeather.BucketName`        |
| `CF_DISTRIBUTION_ID`     | `AetherWeather.DistributionId`    |
| `AWS_ACCOUNT_ID`         | Your 12-digit AWS account number  |
| `APP_URL`                | `AetherWeather.AppUrl`            |

No AWS access keys are stored in GitHub — the workflow uses OIDC (short-lived tokens).

### 6. First manual deploy

Push to `main` or trigger the workflow manually:

```bash
git add -A && git commit -m "Initial deploy" && git push origin main
```

Go to GitHub → Actions and watch the "Deploy to AWS" workflow.

---

## Local development

Local dev is unchanged — the proxy is only used in production builds:

```bash
cp .env.example .env.local
# Set VITE_LLM_PROVIDER=anthropic and VITE_ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

---

## Updating infrastructure

If you change anything in `infrastructure/` or `lambda/`:

```bash
cd infrastructure
cdk diff    # preview what will change
cdk deploy  # apply
```

Or push to `main` — the GitHub Actions `deploy-infra` job runs automatically when
those files change.

---

## Cost estimate (low traffic)

| Service              | Free tier                  | Beyond free tier        |
|----------------------|----------------------------|-------------------------|
| CloudFront           | 1 TB / 10M requests / mo   | ~$0.009 / GB            |
| S3                   | 5 GB / 20K requests / mo   | ~$0.023 / GB            |
| Lambda               | 1M requests / 400K GB-s/mo | ~$0.20 / 1M requests    |
| Secrets Manager      | 30 days free per secret    | $0.40 / secret / mo     |
| **Typical total**    |                            | **< $5 / month**        |

---

## Long-term mobile app path

This backend is already mobile-ready. When you add a React Native app:

1. The React Native app calls `https://your-cloudfront-url/api/anthropic/*` — same endpoint.
2. Add Cognito auth to the API Gateway for user accounts.
3. Add DynamoDB to persist saved locations across devices.
4. Add SNS → APNs/FCM for severe-alert push notifications.

No backend rewrite needed — just new Lambda routes and CDK constructs.
