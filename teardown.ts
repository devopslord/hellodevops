infrastructure/lib/resources/props/teardownEventbridge-props.ts

export interface TeardownEventBridgeProps {
  lambdaArn: string;
  invokeRoleArn: string;
  scheduleName: string;
  delayMinutes?: number; // defaults to 60
}


infrastructure/lib/resources/props/teardownLambda-props.ts

import { IRole } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

export interface TeardownLambdaProps {
  id: string;
  functionName: string;
  handler: string;
  runtime?: Runtime;
  codePath: string;
  lambdaKmsArn: string;
  role: IRole;
  vpcId: string;
  subnetIds: string[];
  securityGroupIds: string[];
  ba: string;
  component: string;
  ownerContact: string;
}

infrastructure/lib/resources/teardownEventbridge.ts

import { Construct } from 'constructs';
import { CfnSchedule } from 'aws-cdk-lib/aws-scheduler';
import { TeardownEventBridgeProps } from './props/teardownEventbridge-props';

export class TeardownEventBridge extends Construct {
  constructor(scope: Construct, id: string, props: TeardownEventBridgeProps) {
    super(scope, id);

    const delayMinutes = props.delayMinutes ?? 60;
    const scheduledTime = new Date(Date.now() + delayMinutes * 60000).toISOString();

    new CfnSchedule(this, 'TeardownSchedule', {
      name: props.scheduleName,
      flexibleTimeWindow: { mode: 'OFF' },
      scheduleExpression: `at(${scheduledTime})`,
      target: {
        arn: props.lambdaArn,
        roleArn: props.invokeRoleArn,
        input: JSON.stringify({}),
      },
    });
  }
}


infrastructure/lib/resources/teardownLambda.ts

import { Construct } from 'constructs';
import {
  CofAwsLambdaFunction,
  OnePipelineCode,
} from '@cof/c1-cdk-lib/c1-lambda';
import {
  Vpc,
  SecurityGroup,
  SubnetFilter,
  ISecurityGroup,
} from 'aws-cdk-lib/aws-ec2';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Stack } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

import { TeardownLambdaProps } from './props/teardownLambda-props';

function buildTeardownLambda(scope: Construct, id: string, props: TeardownLambdaProps) {
  const vpc = Vpc.fromLookup(scope, 'Vpc', { vpcId: props.vpcId });

  const subnets = vpc.selectSubnets({
    subnetFilters: [SubnetFilter.byIds(props.subnetIds)],
  });

  const sgList: ISecurityGroup[] = props.securityGroupIds.map((sgId) =>
    SecurityGroup.fromSecurityGroupId(scope, `SG-${sgId}`, sgId)
  );

  const kmsKey = Key.fromKeyArn(scope, 'TeardownKms', props.lambdaKmsArn);

  const lambda = new CofAwsLambdaFunction(scope, id, {
    functionName: props.functionName,
    runtime: props.runtime ?? Runtime.NODEJS_18_X,
    handler: props.handler,
    code: OnePipelineCode.fromAsset(props.codePath, {
      bundling: {
        externalModules: ['@aws-sdk/client-cloudformation'],
        minify: true,
        target: 'es2020',
        platform: 'node',
        format: 'esm',
      },
    }),
    environmentEncryption: kmsKey,
    vpc,
    vpcSubnets: subnets,
    securityGroups: sgList,
    role: props.role,
    businessApplicationName: props.ba,
    componentName: props.component,
    ownerContact: props.ownerContact,
    environment: {
      STACK_NAME: Stack.of(scope).stackName,
    },
  });

  return lambda;
}

export class TeardownLambdaBlock extends Construct {
  public readonly lambdaArn: string;

  constructor(scope: Construct, id: string, props: TeardownLambdaProps) {
    super(scope, id);

    const lambda = buildTeardownLambda(this, `${props.id}-lambda`, props);
    this.lambdaArn = lambda.functionArn;
  }
}

















//main.ts
import {
  TeardownLambdaBlock,
} from '../lib/resources/teardownLambda';
import {
  TeardownLambdaProps,
} from '../lib/resources/props/teardownLambda-props';
import {
  TeardownEventBridge,
} from '../lib/resources/teardownEventbridge';
import {
  TeardownEventBridgeProps,
} from '../lib/resources/props/teardownEventbridge-props';
import {
  PfcAvenueBlock,
} from '../lib/resources/avenue';
import {
  PfcAvenueProps,
} from '../lib/resources/props/avenue-props';
import { Role } from 'aws-cdk-lib/aws-iam';

...

// inside env.regions!.forEach(...)
const teardownIamProps: PfcAvenueProps = {
  id: 'teardown-cleaner',
  envTier: env.tier,
  appName: 'teardown',
  ba: props.ba!,
  asv: props.asv!,
  component: props.component!,
  pfcComponent: 'teardown-cleaner',
  configRoot: configRootDir,
  trustPolicyFile: 'shared/iam/trust-lambda.json',
  attachPoliciesFiles: [
    {
      policyName: 'pfc-cleanup-policy',
      policyDocument: 'shared/iam/pfc-cleanup-policy.json',
    },
  ],
};

const teardownIam = new PfcAvenueBlock(app, `${env.tier}-${region}-TeardownIAM`, teardownIamProps);

const teardownRoleArn = teardownIam.output.find(o => o.id === 'teardown-cleaner')?.avenueRoleArn!;
const teardownRole = Role.fromRoleArn(app, `${env.tier}-${region}-TeardownRoleRef`, teardownRoleArn);

// Teardown Lambda
const teardownLambda = new TeardownLambdaBlock(app, `${env.tier}-${region}-teardownLambda`, {
  id: 'teardown-cleaner',
  functionName: `teardown-${env.tier}-${region}`,
  handler: 'index.handler',
  runtime: Runtime.NODEJS_18_X,
  codePath: path.join(__dirname, '../../lib/lambda/teardown'),
  lambdaKmsArn: 'arn:aws:kms:REGION:ACCOUNT:key/KEY-ID', // TODO: replace
  role: teardownRole,
  vpcId: 'vpc-abc',               // TODO: pull from config
  subnetIds: ['subnet-xyz'],     // TODO: pull from config
  securityGroupIds: ['sg-123'],  // TODO: pull from config
  ba: props.ba!,
  component: props.component!,
  ownerContact: props.ownerContact!,
});

// Scheduler
new TeardownEventBridge(app, `${env.tier}-${region}-teardownSchedule`, {
  lambdaArn: teardownLambda.lambdaArn,
  invokeRoleArn: teardownRoleArn,
  scheduleName: `teardown-${env.tier}-${region}`,
  delayMinutes: 120,
});





