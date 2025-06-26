// lib/resources/eventbridge.ts
import { Construct } from 'constructs';
import { aws_events as events, Tags } from 'aws-cdk-lib';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { CofAwsLambdaFunction } from '@cof/c1-cdk-lib/c1-lambda';  // <— your new Lambda factory returns this
import { EventBridgeProps } from './props/eventbridge-props';

export function createSelfDestructRule(
  scope: Construct,
  targetFn: CofAwsLambdaFunction,     // <-- implements IFunction
  props: EventBridgeProps
): events.Rule {
  const rule = new events.Rule(scope, `${props.ruleName}-Rule`, {
    ruleName: props.ruleName,
    description: props.description,
    schedule: events.Schedule.expression(props.scheduleExpression),
    targets: [ new LambdaFunction(targetFn) ],
  });

  // gen-3 tagging so it shows up properly in your asset reports
  if (props.environmentType) {
    Tags.of(rule).add('environmentType', props.environmentType);
  }
  if (props.businessApplicationName) {
    Tags.of(rule).add('businessApplicationName', props.businessApplicationName);
  }
  if (props.componentName) {
    Tags.of(rule).add('componentName', props.componentName);
  }

  return rule;
}


// lib/resources/props/eventbridge-props.ts
export interface EventBridgeProps {
  /** must be unique across your account / region */
  ruleName: string;

  /** cron or rate expression, e.g. "rate(1 hour)" or "cron(0 1 * * ? *)" */
  scheduleExpression: string;

  /** (optional) copy in if you want to tag your Rule to match your Lambdas */
  environmentType?: string;
  businessApplicationName?: string;
  componentName?: string;
  /** (optional) human-friendly description in the console */
  description?: string;
}

lib/resources/lambda.ts
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Duration, aws_lambda as lambda } from 'aws-cdk-lib';
import { CofAwsLambdaFunction } from '@cof/c1-cdk-lib/c1-lambda';
import * as path from 'path';

import { LambdaProps } from './props/lambda-props';

export function createDestroyLambda(
  scope: Construct,
  props: LambdaProps
): CofAwsLambdaFunction {
  // 1) import your existing IAM role
  const role = iam.Role.fromRoleArn(
    scope,
    `DestroyLambdaRole-${props.functionName}`,
    props.iamRoleArn,
    { mutable: false }
  );

  // 2) lookup your VPC + subnets + security groups
  const vpc = ec2.Vpc.fromLookup(scope, `${props.functionName}-Vpc`, {
    vpcId: props.vpcId,
  });

  const subnets = props.subnetIds.map((sid, i) =>
    ec2.Subnet.fromSubnetId(scope, `${props.functionName}-Subnet${i}`, sid)
  );

  const securityGroups = props.securityGroupIds.map((sg, i) =>
    ec2.SecurityGroup.fromSecurityGroupId(
      scope,
      `${props.functionName}-SG${i}`,
      sg
    )
  );

  // 3) finally, create the Capital-One Cof construct
  return new CofAwsLambdaFunction(scope, props.functionName, {
    // required Cof props:
    functionName:           props.functionName,
    environmentType:        props.environmentGroup ?? 'Dev',
    businessApplicationName: props.functionName,    // ← swap in your real ASV/app name
    componentName:          'SelfDestruct',         // ← logical grouping for this lambda
    ownerContact:           'team-alerts@capitalone.com', // ← your on-call/email

    // standard lambda props:
    runtime:     props.runtime,
    handler:     'index.handler',
    code:        lambda.Code.fromAsset(
                   path.resolve(__dirname, '..', '..', 'lambda', 'self-destruct')
                 ),
    memorySize:  props.memorySize,
    timeout:     Duration.seconds(props.timeout),

    // wire up your imported role & networking:
    role,
    vpc,
    vpcSubnets:  { subnets },
    securityGroups,

    // env var injection (we always inject STACK_ID, you can add more)
    environment: {
      STACK_ID: props.stackNames[0],
      ...props.environment,
    },

    // (you can also pass logGroup, logEncryptionKey, traffic-shift configs, etc.)
  });
}


//lib/resources/props/lambda-props.ts

import { Runtime } from 'aws-cdk-lib/aws-lambda';

export interface LambdaProps {
  /** logical & console name of the function */
  functionName: string;

  /** Lambda runtime */
  runtime: Runtime;

  /** in seconds */
  timeout: number;

  /** in MB */
  memorySize: number;

  /** which stacks this function should act against */
  stackNames: string[];

  /** existing VPC id to import */
  vpcId: string;

  /** existing Subnet IDs to import */
  subnetIds: string[];

  /** existing SG IDs to import */
  securityGroupIds: string[];

  /** ARN of an already-existing IAM role for this fn */
  iamRoleArn: string;

  /** used for tagging/naming conventions (e.g. “dev” / “qa” / “prod”) */
  environmentGroup?: string;

  /**
   * any additional environment variables you want to inject
   * (we’ll still surface STACK_ID from stackNames[0] for you)
   */
  environment?: Record<string,string>;
}
