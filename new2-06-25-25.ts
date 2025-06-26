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




//v2 lib/resources/lambda.ts
import { Construct } from 'constructs';
import { Stack, Duration, aws_lambda as lambda } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
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
    `LambdaRole-${props.functionName}`,
    props.iamRoleArn,
    { mutable: false }
  );

  // 2) declare your VPC purely from the IDs you already have—no AWS lookups
  const stack = Stack.of(scope);
  const vpc = ec2.Vpc.fromVpcAttributes(scope, `${props.functionName}Vpc`, {
    vpcId: props.vpcId,
    availabilityZones: stack.availabilityZones,
    privateSubnetIds: props.subnetIds,     // or publicSubnetIds if your JSON is public subnets
  });

  // 3) import your subnets & security groups by ID
  const subnets = props.subnetIds.map((id, i) =>
    ec2.Subnet.fromSubnetId(scope, `${props.functionName}Subnet${i}`, id)
  );
  const securityGroups = props.securityGroupIds.map((id, i) =>
    ec2.SecurityGroup.fromSecurityGroupId(
      scope,
      `${props.functionName}SG${i}`,
      id
    )
  );

  // 4) create the Cof Gen-3 Lambda construct
  return new CofAwsLambdaFunction(scope, props.functionName, {
    // Core Cof props
    functionName:            props.functionName,
    environmentType:         props.environmentGroup ?? 'Dev',
    businessApplicationName: props.functionName,       // swap in real ASV if you like
    componentName:           'SelfDestruct',            // or your logical component
    ownerContact:            'team-alerts@capitalone.com',

    // Standard Lambda props
    runtime:    props.runtime,
    handler:    'index.handler',
    code:       lambda.Code.fromAsset(
                  path.resolve(__dirname, '..', '..', 'lambda', 'self-destruct')
                ),
    memorySize: props.memorySize,
    timeout:    Duration.seconds(props.timeout),

    // Networking & IAM
    role,
    vpc,
    vpcSubnets:    { subnets },
    securityGroups,

    // Env-var injection (we always inject STACK_ID)
    environment: {
      STACK_ID: props.stackNames[0],
      ...props.environment,
    },
  });
}



//v2 lib/resources/props/lambda-props.ts
import { Runtime } from 'aws-cdk-lib/aws-lambda';

export interface LambdaProps {
  /** logical & console name of the function */
  functionName: string;

  /** NodeJS, Python, etc. */
  runtime: Runtime;

  /** function timeout in seconds */
  timeout: number;

  /** memorySize in MB */
  memorySize: number;

  /** stack(s) this function will operate against */
  stackNames: string[];

  /** existing VPC ID from your JSON */
  vpcId: string;

  /** existing Subnet IDs from your JSON */
  subnetIds: string[];

  /** existing Security-Group IDs from your JSON */
  securityGroupIds: string[];

  /** ARN of an imported IAM Role */
  iamRoleArn: string;

  /** e.g. "dev", "qa", "prod"—used for tagging/naming */
  environmentGroup?: string;

  /** any extra ENV vars you want to inject */
  environment?: Record<string,string>;
}






//v3 bin/demo.ts
#!/opt/homebrew/opt/node/bin/node
import * as cdk from 'aws-cdk-lib';
import 'source-map-support/register';
import { lambda } from '@cof/c1-cdk-lib';
import { DemoStack } from '../lib/demo-stack';
import { OnePipelineStackSynthesizer } from '@cof/c1-cdk-lib/core/lib/c1-stack-synthesizers';
import * as devConfig from '../config/dev.json';
import * as qaConfig from '../config/qa.json';
import * as prodConfig from '../config/prod.json';
import { LambdaProps } from '../lib/resources/props/lambda-props';
import { EventBridgeProps } from '../lib/resources/props/eventbridge-props';

const app = new cdk.App();
const APP_NAME =
  app.node.tryGetContext('@opl-cdk/bogiefile:name') || 'pfc-cdk-demo-wpc885';
const ba =
  app.node.tryGetContext('@opl-cdk/bogiefile:ba') ||
  'BAPrometheusFinancialCoreInternal';
const component =
  app.node.tryGetContext('@opl-cdk/bogiefile:component') ||
  'PFCCDKDEMOINTERNAL';
const owner =
  app.node.tryGetContext('@opl-cdk/bogiefile:owner') ||
  'wpc885@capitalone.com';
const deploymentEnvs = ['dev', 'qa'] as const;

deploymentEnvs.forEach((depEnv) => {
  let config: any = devConfig;
  if (depEnv === 'prod') {
    config = prodConfig;
    console.log(`Deploying ${APP_NAME} with PROD Configs`);
  } else if (depEnv === 'qa') {
    config = qaConfig;
    console.log(`Deploying ${APP_NAME} with QA Configs`);
  } else {
    console.log(`Deploying ${APP_NAME} with DEV Configs`);
  }

  const baseName = config.stack.name as string;
  const envKey = (config.environment as string) || depEnv;

  config['deployment-regions'].forEach((input: any) => {
    const region = input.region as string;
    const stackId = `${baseName}-${envKey}-${region}`;

    // Build the self-destruct Lambda props
    const lambdaProps: LambdaProps = {
      functionName: input.cleanupFunctionName || `destroy-${stackId}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: config.lambda.timeout,
      memorySize: config.lambda.memorySize,
      stackNames: [stackId],
      vpcId: input.vpc,
      subnetIds: input.subnets,
      securityGroupIds: input.serviceSecurityGroups,
      iamRoleArn: config.lambda.iamRoleArn || input.lambdaRoleARN,
      environment: {
        STACK_ID: stackId,
        ENV: envKey,
        environmentGroup: depEnv,
      },
    };

    // Build the EventBridge schedule props
    const eventBridgeProps: EventBridgeProps = {
      ruleName: config.eventbridge.ruleName,
      scheduleExpression: config.eventbridge.scheduleExpression,
    };

    // Instantiate the merged DemoStack
    const stack = new DemoStack(app, `pfc-cdk-demo-${depEnv}-stack-${region}`, {
      description: 'demo stack deployed through pfc/pfc-cdk-demo',
      asv: config.asv,
      synthesizer: new OnePipelineStackSynthesizer({
        // these two props are for local synth; comment out before pipeline runs
        // fileAssetsBucketName: 'local-bucket-fna516',
        // bucketPrefix: 'pfc-cdk-sandbox-api',
      }),
      env: {
        account: input.awsaccountid,
        region,
      },

      vpc: input.vpc,
      subnets: input.subnets,
      serviceSecurityGroups: input.serviceSecurityGroups,
      albSecurityGroups: input.albSecurityGroups,
      environmentGroup: depEnv,
      listenerCertArn: input.listenerCertArn,
      hostedZoneId: input.hostedZoneId,
      recordName: `use1.${APP_NAME}-${depEnv}.${ba}.${input.awsaccountid}.aws.cb4good.com`,
      appName: `${APP_NAME}-${depEnv}`,

      // Ephemeral-Fargate additions:
      lambdaProps,
      eventBridgeProps,
    });

    // App-level tags
    cdk.Tags.of(app).add('BA', ba);
    cdk.Tags.of(app).add('Component', component);
    cdk.Tags.of(app).add('ASV', config.asv);
    cdk.Tags.of(app).add('OwnerContact', owner);

    // Any extra tags from the JSON
    if (config.tags) {
      Object.entries(config.tags).forEach(([key, value]) => {
        cdk.Tags.of(stack).add(key, value as string);
      });
    }
  });
});

app.synth();



//v3 lib/demo-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { AvenueRole, AvenuePolicy } from '@cof/c1-cdk-lib/c1-avenue';
import { CfnServicePrincipalName } from 'aws-cdk-lib/aws-pcaConnectorAd';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

import { createDestroyLambda } from './resources/lambda';
import { createSelfDestructRule } from './resources/eventbridge';
import { LambdaProps } from './resources/props/lambda-props';
import { EventBridgeProps } from './resources/props/eventbridge-props';

export interface PfcDemoStackProps extends cdk.StackProps {
  vpc: string;
  subnets: Array<string>;
  albSecurityGroups: Array<string>;
  serviceSecurityGroups: Array<string>;
  listenerCertArn: string;
  hostedZoneId: string;
  recordName: string;
  appName: string;
  /**
   * Deployment environment group such as dev, qa or prod
   * @default 'dev'
   */
  readonly environmentGroup?: string;
  /**
   * Business Application
   * @default 'ASVPROMETHEUSFINANCIALCOREINTERNAL'
   */
  readonly ba?: string;
  /**
   * The Application Service Version
   * @default 'ASVPROMETHEUSFINANCIALCOREINTERNAL'
   */
  readonly asv?: string;
  /**
   * The application's owner contact
   * @default 'wpc885@capitalone.com'
   */
  readonly ownerContact?: string;
  /**
   * The component name
   * @default 'PFC CDK DEMO'
   */
  readonly component?: string;
  /**
   * Artifactory Image URI
   * @default 'artifactory.cloud.capitalone.com/baprometheusfinancialcore-docker/pfc-sandbox-app-ak:0.1.6'
   */
  readonly image?: string;

  /**
   * Props for the self-destruct Lambda
   */
  readonly lambdaProps: LambdaProps;
  /**
   * Props for scheduling the self-destruct via EventBridge
   */
  readonly eventBridgeProps: EventBridgeProps;
}

export class DemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PfcDemoStackProps) {
    super(scope, id, props);

    // Avenue role & policy (existing)
    const role = new AvenueRole(this, 'pfc-demo-role', {
      roleName: `${props.appName}-role-wpc885`,
      servicePrincipalName: 'ec2.amazonaws.com',
      tags: {
        BA: 'BAPrometheusFinancialCoreInternal',
        OwnerContact: 'wpc885@capitalone.com',
      },
    });

    const policy = new AvenuePolicy(this, 'pfc-demo-policy', {
      policyName: `${props.appName}-policy-wpc885`,
      tags: {
        BA: 'BAPrometheusFinancialCoreInternal',
        OwnerContact: 'wpc885@capitalone.com',
      },
    });

    policy.addStatements(
      new iam.PolicyStatement({
        actions: [
          'logs:PutDestination',
          'logs:PutDestinationPolicy',
          'logs:ListLogDeliveries',
        ],
        resources: ['*'],
        effect: iam.Effect.ALLOW,
      }),
    );

    role.attachPolicy(policy);

    // ──────── Ephemeral Fargate logic ────────

    // Lookup the existing VPC (requires CDK bootstrap trust in target accounts)
    const vpc = ec2.Vpc.fromLookup(this, 'ImportedVPC', {
      vpcId: props.vpc,
    });

    // Create an ECS Fargate cluster in the imported VPC
    new ecs.Cluster(this, 'FargateCluster', { vpc });

    // Deploy the cleanup Lambda and schedule
    const destroyLambda = createDestroyLambda(this, props.lambdaProps);
    createSelfDestructRule(this, destroyLambda, props.eventBridgeProps);

    // example resource
    // const queue = new sqs.Queue(this, 'DemoQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300),
    // });
  }
}