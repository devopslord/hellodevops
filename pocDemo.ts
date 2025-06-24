your-cdk-project/
├── bin/
│   └── demo-merged.ts                      # Entry point for CDK app
│
├── lib/
│   ├── merged-stack.ts                    # Combined Demo + Fargate + Lambda stack
│
│   ├── resources/
│   │   ├── eventbridge.ts                 # Creates EventBridge rule
│   │   ├── lambda.ts                      # Creates destroy Lambda
│   │   ├── config-loader.ts               # Loads JSON config (assumed utility)
│   │
│   │   ├── props/
│   │   │   ├── eventbridge-props.ts       # EventBridgeProps interface
│   │   │   ├── lambda-props.ts            # LambdaProps interface
│   │   │   ├── index-props.ts             # StackProps interface (vpcId, name)
│   │
│   ├── demo-stack.ts                      # (if still used separately, else archived)
│   ├── ephemeral-fargate-stack.ts         # (if still used separately, else archived)
│
├── lambda/
│   └── self-destruct/
│       └── index.ts                       # Exports handler for destroy function
│
├── resources/
│   ├── dev.json                           # Deployment config for `dev`
│   ├── qa.json                            # Deployment config for `qa`
│   ├── prod.json                          # (optional, if you add `prod` later)
│
├── test/                                  # Optional unit tests
│
├── package.json
├── tsconfig.json
├── jest.config.js
├── cdk.json
└── README.md


1.demo-merged.ts
├── bin/
│   └── demo-merged.ts 



//lib/resources/props/lambda-props.ts


//lib/resources/lambda.ts
import { aws_lambda as lambda, Duration } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as path from 'path';
import { LambdaProps } from './props/lambda-props';

export function createDestroyLambda(scope: Construct, lambdaProps: LambdaProps): lambda.Function {
  if (!lambdaProps.iamRoleArn) {
    throw new Error('Missing iamRoleArn in lambdaProps');
  }

  const role = iam.Role.fromRoleArn(scope, 'ImportedLambdaRole', lambdaProps.iamRoleArn, {
    mutable: false,
  });

  const vpc = ec2.Vpc.fromLookup(scope, 'LambdaVpc', {
    vpcId: lambdaProps.vpcId!,
  });

  const subnets = lambdaProps.subnetIds?.map((id, idx) =>
    ec2.Subnet.fromSubnetId(scope, `LambdaSubnet${idx}`, id)
  ) ?? [];

  const securityGroups = lambdaProps.securityGroupIds?.map((id, idx) =>
    ec2.SecurityGroup.fromSecurityGroupId(scope, `LambdaSG${idx}`, id)
  ) ?? [];

  const destroyLambda = new lambda.Function(scope, lambdaProps.functionName, {
    functionName: lambdaProps.functionName,
    runtime: lambdaProps.runtime,
    handler: 'index.handler', // index.ts must export `handler`
    code: lambda.Code.fromAsset(
      path.resolve(__dirname, '..', '..', 'lambda', 'self-destruct')
    ),
    memorySize: lambdaProps.memorySize,
    timeout: Duration.seconds(lambdaProps.timeout ?? 60),
    role,
    vpc,
    vpcSubnets: { subnets },
    securityGroups,
    environment: {
      STACK_NAMES: lambdaProps.stackNames.join(','),
    },
  });

  return destroyLambda;
}


//lib/resources/props/eventbridge-props.ts
export interface EventBridgeProps {
  ruleName?: string;
  scheduleExpression: string;
}

//lib/resources/eventbridge.ts

import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { EventBridgeProps } from './props/eventbridge-props';
import { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';

export function createSelfDestructRule(
  scope: Construct,
  lambda: LambdaFunction,
  props: EventBridgeProps
): events.Rule {
  const rule = new events.Rule(scope, 'SelfDestructRule', {
    schedule: events.Schedule.expression(props.scheduleExpression),
  });

  rule.addTarget(new targets.LambdaFunction(lambda));
  return rule;
}

//lib/resources/props/index-props.ts
export interface StackProps {
  stackName?: string;
  vpcId?: string;
}


//bin/demo-merged.ts

//(dynamically passes Lambda, EventBridge, and Stack props per environment/region)
//bin/demo-merged.ts

#!/opt/homebrew/opt/node/bin/node
import * as cdk from 'aws-cdk-lib';
import 'source-map-support/register';
import { lambda } from 'aws-cdk-lib';

import { OnePipelineStackSynthesizer } from '@cof/cl-cdk-lib/core/lib/cl-stack-synthesizers';
import { MergedStack } from '../lib/merged-stack';

import devConfig from '../lib/resources/dev.json';
import qaConfig from '../lib/resources/qa.json';
import prodConfig from '../lib/resources/prod.json';

import { LambdaProps } from '../lib/resources/props/lambda-props';
import { EventBridgeProps } from '../lib/resources/props/eventbridge-props';
import { StackProps as CustomStackProps } from '../lib/resources/props/index-props';

const app = new cdk.App();

const APP_NAME = app.node.tryGetContext('@opl-cdk/bogiefile:name') || 'pfc-cdk-demo-vpc885';
const ba = app.node.tryGetContext('@opl-cdk/bogiefile:ba') || 'BAPrometheusFinancialCoreInternal';
const component = app.node.tryGetContext('@opl-cdk/bogiefile:component') || 'PFCICDKDEMOINTERNAL';
const owner = app.node.tryGetContext('@opl-cdk/bogiefile:owner') || 'vpc885@capitalone.com';

const deploymentEnvs = ['dev', 'qa'];

deploymentEnvs.forEach((depEnv) => {
  let config = devConfig;
  if (depEnv === 'prod') {
    config = prodConfig;
    console.log(`Deploying ${APP_NAME} with PROD Configs`);
  } else if (depEnv === 'qa') {
    config = qaConfig;
    console.log(`Deploying ${APP_NAME} with QA Configs`);
  } else {
    console.log(`Deploying ${APP_NAME} with DEV Configs`);
  }

  config['deployment-regions'].forEach((input) => {
    const lambdaProps: LambdaProps = {
      functionName: `destroy-${depEnv}-${input.region}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: config.lambda?.timeout ?? 60,
      memorySize: config.lambda?.memorySize ?? 128,
      stackNames: config.lambda?.stackNames ?? ['example-stack'],
      vpcId: input.vpc,
      subnetIds: input.subnets,
      securityGroupIds: input.serviceSecurityGroups,
      iamRoleArn: config.lambda?.iamRoleArn ?? input.lambdaRoleARN,
    };

    const eventBridgeProps: EventBridgeProps = {
      ruleName: config.eventbridge?.ruleName ?? `self-destruct-${depEnv}`,
      scheduleExpression: config.eventbridge?.scheduleExpression ?? 'rate(1 day)',
    };

    const stackProps: CustomStackProps = {
      stackName: config.stack?.name ?? `${APP_NAME}-${depEnv}`,
      vpcId: input.vpc,
    };

    new MergedStack(app, `merged-${depEnv}-${input.region}`, {
      description: 'Unified stack: demo infra + ephemeral fargate + cleanup lambda',
      env: {
        account: input.awsaccountid,
        region: input.region,
      },
      appName: `${APP_NAME}-${depEnv}`,
      ba,
      asv: config.asv,
      component,
      ownerContact: owner,
      vpc: input.vpc,
      subnets: input.subnets,
      serviceSecurityGroups: input.serviceSecurityGroups,
      albSecurityGroups: input.albSecurityGroups,
      environmentGroup: depEnv,
      listenerCertArn: input.listenerCertArn,
      hostedZoneId: input.hostedZoneId,
      recordName: `use1.${APP_NAME}-${depEnv}.${ba}.${input.awsaccountid}.aws.cb4good.com`,
      lambdaProps,
      eventBridgeProps,
      ...stackProps,
      synthesizer: new OnePipelineStackSynthesizer(),
    });

    cdk.Tags.of(app).add('BA', ba);
    cdk.Tags.of(app).add('Component', component);
    cdk.Tags.of(app).add('ASV', config.asv);
    cdk.Tags.of(app).add('OwnerContact', owner);
  });
});



//lib/merged-stack.ts

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';

import { AvenueRole, AvenuePolicy } from '@cof/cl-cdk-lib/c1-avenue';
import { createDestroyLambda } from '../resources/lambda';
import { createSelfDestructRule } from '../resources/eventbridge';

import { LambdaProps } from '../resources/props/lambda-props';
import { EventBridgeProps } from '../resources/props/eventbridge-props';
import { StackProps as CustomStackProps } from '../resources/props/index-props';

export interface MergedStackProps extends cdk.StackProps, CustomStackProps {
  vpc: string;
  subnets: string[];
  albSecurityGroups: string[];
  serviceSecurityGroups: string[];
  listenerCertArn: string;
  hostedZoneId: string;
  recordName: string;
  appName: string;

  environmentGroup?: string;
  ba?: string;
  asv?: string;
  ownerContact?: string;
  component?: string;
  image?: string;

  lambdaProps: LambdaProps;
  eventBridgeProps: EventBridgeProps;
}

export class MergedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MergedStackProps) {
    super(scope, id, props);

    // ── Demo IAM role/policy ─
    const role = new AvenueRole(this, 'pfc-demo-role', {
      roleName: `${props.appName}-role-vpc885`,
      servicePrincipalName: 'ec2.amazonaws.com',
      tags: {
        BA: props.ba ?? 'BAPrometheusFinancialCoreInternal',
        OwnerContact: props.ownerContact ?? 'vpc885@capitalone.com',
      },
    });

    const policy = new AvenuePolicy(this, 'pfc-demo-policy', {
      policyName: `${props.appName}Policy-vpc885`,
      tags: {
        BA: props.ba ?? 'BAPrometheusFinancialCoreInternal',
        OwnerContact: props.ownerContact ?? 'vpc885@capitalone.com',
      },
    });

    policy.addStatements(
      new iam.PolicyStatement({
        actions: ['logs:PutDestinationPolicy', 'logs:ListLogDeliveries'],
        resources: ['*'],
        effect: iam.Effect.ALLOW,
      })
    );

    role.stackPolicy(policy);

    // ── ECS cluster ─
    const vpc = ec2.Vpc.fromLookup(this, 'ExistingVPC', {
      vpcId: props.vpc,
    });

    new ecs.Cluster(this, 'FargateCluster', { vpc });

    // ── Self-destruct Lambda + EventBridge ─
    const destroyLambda = createDestroyLambda(this, props.lambdaProps);
    createSelfDestructRule(this, destroyLambda, props.eventBridgeProps);
  }
}
