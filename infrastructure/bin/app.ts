#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WeatherAppStack } from '../lib/weather-stack';

const app = new cdk.App();

// Read config from CDK context or environment. Override via:
//   cdk deploy -c githubOwner=myuser -c githubRepo=aether-weather
const githubOwner = app.node.tryGetContext('githubOwner') ?? process.env.GITHUB_OWNER ?? 'REPLACE_ME';
const githubRepo  = app.node.tryGetContext('githubRepo')  ?? process.env.GITHUB_REPO  ?? 'aether-weather';
// Optional: set a custom domain, leave blank to use the CloudFront *.cloudfront.net URL.
const domainName  = app.node.tryGetContext('domainName')  ?? process.env.DOMAIN_NAME  ?? '';

new WeatherAppStack(app, 'AetherWeather', {
  githubOwner,
  githubRepo,
  domainName: domainName || undefined,
  env: {
    // CloudFront ACM certificates must be in us-east-1.
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  'us-east-1',
  },
  description: 'Aether Weather — frontend (S3+CloudFront) + Anthropic proxy (Lambda)',
});
