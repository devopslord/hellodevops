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








/////////new

1. Lambda Code: lib/lambda/teardown/index.ts

import { CloudFormationClient, DeleteStackCommand } from '@aws-sdk/client-cloudformation';

export const handler = async () => {
  const stackName = process.env.STACK_NAME;

  if (!stackName) {
    throw new Error('Missing STACK_NAME env var');
  }

  const cf = new CloudFormationClient({});

  try {
    await cf.send(new DeleteStackCommand({ StackName: stackName }));
    console.log(`Stack deletion initiated: ${stackName}`);
    return { status: 'success', message: `Deleted ${stackName}` };
  } catch (err) {
    console.error('Stack deletion failed:', err);
    return { status: 'error', message: (err as Error).message };
  }
};


2. CDK: teardownLambda.ts
lib/resources/teardownLambda.ts

import { Construct } from 'constructs';
import {
  CofAwsLambdaFunction,
  OnePipelineCode,
} from '@cof/c1-cdk-lib/c1-lambda';
import {
  Vpc,
  SubnetFilter,
  SecurityGroup,
  ISecurityGroup,
} from 'aws-cdk-lib/aws-ec2';
import { Runtime, Function } from 'aws-cdk-lib/aws-lambda';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Stack } from 'aws-cdk-lib';
import { TeardownLambdaProps } from './props/teardownLambda-props';

export class TeardownLambdaBlock extends Construct {
  public readonly lambda: Function;

  constructor(scope: Construct, id: string, props: TeardownLambdaProps) {
    super(scope, id);

    const vpc = Vpc.fromLookup(this, 'Vpc', { vpcId: props.vpcId });
    const subnets = vpc.selectSubnets({
      subnetFilters: [SubnetFilter.byIds(props.subnetIds)],
    });

    const sgList: ISecurityGroup[] = props.securityGroupIds.map((sgId) =>
      SecurityGroup.fromSecurityGroupId(this, `SG-${sgId}`, sgId)
    );

    const kmsKey = Key.fromKeyArn(this, 'LambdaKmsKey', props.lambdaKmsArn);

    this.lambda = new CofAwsLambdaFunction(this, 'TeardownFunction', {
      functionName: props.functionName,
      handler: props.handler,
      runtime: props.runtime ?? Runtime.NODEJS_18_X,
      vpc,
      vpcSubnets: subnets,
      securityGroups: sgList,
      role: props.role,
      code: OnePipelineCode.fromAsset(props.codePath),
      environmentEncryption: kmsKey,
      businessApplicationName: props.ba,
      componentName: props.component,
      ownerContact: props.ownerContact,
      environment: {
        STACK_NAME: Stack.of(this).stackName,
      },
    });
  }
}







3. Props: teardownLambda-props.ts

📁 lib/resources/props/teardownLambda-props.ts

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


4. EventBridge Scheduler: teardownEventbridge.ts

📁 lib/resources/teardownEventbridge.ts

import { Construct } from 'constructs';
import { CfnSchedule } from 'aws-cdk-lib/aws-scheduler';
import { TeardownEventBridgeProps } from './props/teardownEventbridge-props';

export class TeardownEventBridge extends Construct {
  constructor(scope: Construct, id: string, props: TeardownEventBridgeProps) {
    super(scope, id);

    const delayMinutes = props.delayMinutes ?? 30;
    const scheduledTime = new Date(Date.now() + delayMinutes * 60000).toISOString();

    new CfnSchedule(this, 'Scheduler', {
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


5. Props: teardownEventbridge-props.ts

📁 lib/resources/props/teardownEventbridge-props.ts
export interface TeardownEventBridgeProps {
  id: string;
  scheduleName: string;
  lambdaArn: string;
  invokeRoleArn: string;
  delayMinutes?: number;
}



Next Step: Integration

In main.ts:

new TeardownLambdaBlock(app, 'teardown-lambda', {
  id: 'teardown-cleaner',
  functionName: 'teardown-cleaner-fn',
  handler: 'index.handler',
  runtime: Runtime.NODEJS_18_X,
  codePath: path.join(__dirname, '../../lib/lambda/teardown'),
  lambdaKmsArn: 'arn:aws:kms:region:acct:key/id',
  vpcId: 'vpc-abc',
  subnetIds: ['subnet-123'],
  securityGroupIds: ['sg-456'],
  role: teardownRole,
  ba: props.ba!,
  component: props.component!,
  ownerContact: props.ownerContact!,
});

new TeardownEventBridge(app, 'teardown-schedule', {
  id: 'schedule-cleanup',
  scheduleName: 'teardown-schedule-cleanup',
  lambdaArn: teardownLambda.lambda.functionArn,
  invokeRoleArn: teardownRole.roleArn,
  delayMinutes: 30,
});




Final Updated Snippet (Insert at the end of env.regions!.forEach((region) => { ... }) block)

Right after the component stacks and before the cdk.Tags.of(app)... block:

// Teardown Lambda (stack self-deletion) + Scheduler
const teardownLambda = new TeardownLambdaBlock(app, 'teardown-lambda', {
  id: 'teardown-cleaner',
  functionName: 'teardown-cleaner-fn',
  handler: 'index.handler',
  runtime: Runtime.NODEJS_18_X,
  codePath: path.join(__dirname, '../../lib/lambda/teardown'),
  lambdaKmsArn: 'arn:aws:kms:region:acct:key/id', // TODO: replace with config
  vpcId: 'vpc-abc',                                // TODO: replace with config
  subnetIds: ['subnet-123'],                      // TODO: replace with config
  securityGroupIds: ['sg-456'],                   // TODO: replace with config
  role: teardownRole,
  ba: props.ba!,
  component: props.component!,
  ownerContact: props.ownerContact!,
});

new TeardownEventBridge(app, 'teardown-schedule', {
  id: 'schedule-cleanup',
  scheduleName: 'teardown-schedule-cleanup',
  lambdaArn: teardownLambda.lambda.functionArn,
  invokeRoleArn: teardownRole.roleArn,
  delayMinutes: 30,
});




Where to Place This

It goes right after:
const instrumentControllerStack = new InstrumentControllerStack(
  app,
  `${env.tier}-${region}-${instrumentControllerConfig.appName}`,
  instrumentControllerConfig
);


And before:
cdk.Tags.of(app).add('pfc_version', tierProps.pfcVersion!);



Reminder

You must still:
	•	🔁 Replace all placeholder values (vpcId, subnetIds, lambdaKmsArn, securityGroupIds) with actual values loaded from your environment config (ConfigLoader)
	•	✅ Ensure teardownRole is instantiated using PfcAvenueBlock elsewhere in your main.ts







     main.ts (Final Full Version)
     #!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';

import { ConfigLoader } from '../lib/util';
import { envProps, PfcProps } from '../lib/resources/props/pfc-props';

import {
  IngestorAvenue,
  IngestorStack,
  IngestorConfig,
} from '../lib/components/ingestor';
import {
  MapperAvenue,
  MapperStack,
  MapperConfig,
} from '../lib/components/dynamic-mapper';
import {
  LedgerAvenue,
  LedgerStack,
  LedgerConfig,
} from '../lib/components/ledger';
import {
  InstrumentControllerAvenue,
  InstrumentControllerStack,
  InstrumentControllerConfig,
} from '../lib/components/instrument-controller';

import { TeardownLambdaBlock } from '../lib/resources/teardownLambda';
import { TeardownEventBridge } from '../lib/resources/teardownEventbridge';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Role } from 'aws-cdk-lib/aws-iam';

const app = new cdk.App();
const configRootDir: string = path.join(__dirname, '../../config');

const rootDefaultConfig = new ConfigLoader(configRootDir).loadYamlAsObject('default.yaml') as envProps;
const props = rootDefaultConfig.global as PfcProps;

props.deployEnvs!.forEach((env) => {
  const rootTierConfig = new ConfigLoader(configRootDir).loadYamlAsObject(`${env.tier}.yaml`) as envProps;
  const tierProps = rootTierConfig.global as PfcProps;

  env.regions!.forEach((region) => {
    // load regional configs
    const ingestorConfig = new IngestorConfig(configRootDir).loadProps(env.tier, region);
    const mapperConfig = new MapperConfig(configRootDir).loadProps(env.tier, region);
    const ledgerConfig = new LedgerConfig(configRootDir).loadProps(env.tier, region);
    const instrumentControllerConfig = new InstrumentControllerConfig(configRootDir).loadProps(env.tier, region);

    // create avenue if region is us-east-1
    if (region === 'us-east-1') {
      new IngestorAvenue(app, `${env.tier}-avenue-${ingestorConfig.appName}`, ingestorConfig);
      new MapperAvenue(app, `${env.tier}-avenue-${mapperConfig.appName}`, mapperConfig);
      new LedgerAvenue(app, `${env.tier}-avenue-${ledgerConfig.appName}`, ledgerConfig);
      new InstrumentControllerAvenue(app, `${env.tier}-avenue-${instrumentControllerConfig.appName}`, instrumentControllerConfig);
    }

    // component stacks
    new IngestorStack(app, `${env.tier}-${region}-${ingestorConfig.appName}`, ingestorConfig);
    new MapperStack(app, `${env.tier}-${region}-${mapperConfig.appName}`, mapperConfig);
    new LedgerStack(app, `${env.tier}-${region}-${ledgerConfig.appName}`, ledgerConfig);
    new InstrumentControllerStack(app, `${env.tier}-${region}-${instrumentControllerConfig.appName}`, instrumentControllerConfig);

    // teardown role assumed already defined externally (via PfcAvenueBlock)
    const teardownRole = Role.fromRoleArn(app, `${env.tier}-${region}-TeardownRole`, 'arn:aws:iam::123456789012:role/teardown-role');

    // teardown lambda
    const teardownLambda = new TeardownLambdaBlock(app, 'teardown-lambda', {
      id: 'teardown-cleaner',
      functionName: 'teardown-cleaner-fn',
      handler: 'index.handler',
      runtime: Runtime.NODEJS_18_X,
      codePath: path.join(__dirname, '../../lib/lambda/teardown'),
      lambdaKmsArn: 'arn:aws:kms:region:acct:key/id', // TODO: replace via config
      vpcId: 'vpc-abc',                                // TODO: replace via config
      subnetIds: ['subnet-123'],                      // TODO: replace via config
      securityGroupIds: ['sg-456'],                   // TODO: replace via config
      role: teardownRole,
      ba: props.ba!,
      component: props.component!,
      ownerContact: props.ownerContact!,
    });

    // scheduler to trigger it after 30 minutes
    new TeardownEventBridge(app, 'teardown-schedule', {
      id: 'schedule-cleanup',
      scheduleName: 'teardown-schedule-cleanup',
      lambdaArn: teardownLambda.lambda.functionArn,
      invokeRoleArn: teardownRole.roleArn,
      delayMinutes: 30,
    });
  });

  cdk.Tags.of(app).add('pfc_version', tierProps.pfcVersion!);
});

cdk.Tags.of(app).add('BA', props.ba!);
cdk.Tags.of(app).add('ASV', props.asv!);
cdk.Tags.of(app).add('Component', props.component!);
cdk.Tags.of(app).add('OwnerContact', props.ownerContact!);
if (props.cmdbEnvironment) {
  cdk.Tags.of(app).add('CMDBEnvironment', props.cmdbEnvironment!);
}






#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';

import { ConfigLoader } from '../lib/util';
import { envProps, PfcProps } from '../lib/resources/props/pfc-props';

import {
  IngestorAvenue,
  IngestorStack,
  IngestorConfig,
} from '../lib/components/ingestor';
import {
  MapperAvenue,
  MapperStack,
  MapperConfig,
} from '../lib/components/dynamic-mapper';
import {
  LedgerAvenue,
  LedgerStack,
  LedgerConfig,
} from '../lib/components/ledger';
import {
  InstrumentControllerAvenue,
  InstrumentControllerStack,
  InstrumentControllerConfig,
} from '../lib/components/instrument-controller';

import { TeardownLambdaBlock } from '../lib/resources/teardownLambda';
import { TeardownEventBridge } from '../lib/resources/teardownEventbridge';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Role } from 'aws-cdk-lib/aws-iam';

const app = new cdk.App();
const configRootDir: string = path.join(__dirname, '../../config');

const rootDefaultConfig = new ConfigLoader(configRootDir).loadYamlAsObject('default.yaml') as envProps;
const props = rootDefaultConfig.global as PfcProps;

props.deployEnvs!.forEach((env) => {
  const rootTierConfig = new ConfigLoader(configRootDir).loadYamlAsObject(`${env.tier}.yaml`) as envProps;
  const tierProps = rootTierConfig.global as PfcProps;

  env.regions!.forEach((region) => {
    // load regional configs
    const ingestorConfig = new IngestorConfig(configRootDir).loadProps(env.tier, region);
    const mapperConfig = new MapperConfig(configRootDir).loadProps(env.tier, region);
    const ledgerConfig = new LedgerConfig(configRootDir).loadProps(env.tier, region);
    const instrumentControllerConfig = new InstrumentControllerConfig(configRootDir).loadProps(env.tier, region);

    // create avenue if region is us-east-1
    if (region === 'us-east-1') {
      new IngestorAvenue(app, `${env.tier}-avenue-${ingestorConfig.appName}`, ingestorConfig);
      new MapperAvenue(app, `${env.tier}-avenue-${mapperConfig.appName}`, mapperConfig);
      new LedgerAvenue(app, `${env.tier}-avenue-${ledgerConfig.appName}`, ledgerConfig);
      new InstrumentControllerAvenue(app, `${env.tier}-avenue-${instrumentControllerConfig.appName}`, instrumentControllerConfig);
    }

    // component stacks
    new IngestorStack(app, `${env.tier}-${region}-${ingestorConfig.appName}`, ingestorConfig);
    new MapperStack(app, `${env.tier}-${region}-${mapperConfig.appName}`, mapperConfig);
    new LedgerStack(app, `${env.tier}-${region}-${ledgerConfig.appName}`, ledgerConfig);
    new InstrumentControllerStack(app, `${env.tier}-${region}-${instrumentControllerConfig.appName}`, instrumentControllerConfig);

    // teardown role assumed already defined externally (via PfcAvenueBlock)
    const teardownRole = Role.fromRoleArn(app, `${env.tier}-${region}-TeardownRole`, 'arn:aws:iam::123456789012:role/teardown-role');

    // teardown lambda
    const teardownLambda = new TeardownLambdaBlock(app, 'teardown-lambda', {
      id: 'teardown-cleaner',
      functionName: 'teardown-cleaner-fn',
      handler: 'index.handler',
      runtime: Runtime.NODEJS_18_X,
      codePath: path.join(__dirname, '../../lib/lambda/teardown'),
      lambdaKmsArn: 'arn:aws:kms:region:acct:key/id', // TODO: replace via config
      vpcId: 'vpc-abc',                                // TODO: replace via config
      subnetIds: ['subnet-123'],                      // TODO: replace via config
      securityGroupIds: ['sg-456'],                   // TODO: replace via config
      role: teardownRole,
      ba: props.ba!,
      component: props.component!,
      ownerContact: props.ownerContact!,
    });

    // scheduler to trigger it after 30 minutes
    new TeardownEventBridge(app, 'teardown-schedule', {
      id: 'schedule-cleanup',
      scheduleName: 'teardown-schedule-cleanup',
      lambdaArn: teardownLambda.lambda.functionArn,
      invokeRoleArn: teardownRole.roleArn,
      delayMinutes: 30,
    });
  });

  cdk.Tags.of(app).add('pfc_version', tierProps.pfcVersion!);
});

cdk.Tags.of(app).add('BA', props.ba!);
cdk.Tags.of(app).add('ASV', props.asv!);
cdk.Tags.of(app).add('Component', props.component!);
cdk.Tags.of(app).add('OwnerContact', props.ownerContact!);
if (props.cmdbEnvironment) {
  cdk.Tags.of(app).add('CMDBEnvironment', props.cmdbEnvironment!);
}


Final main.ts // with no todo
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';

import { ConfigLoader } from '../lib/util';
import { envProps, PfcProps } from '../lib/resources/props/pfc-props';

import {
  IngestorAvenue,
  IngestorStack,
  IngestorConfig,
} from '../lib/components/ingestor';
import {
  MapperAvenue,
  MapperStack,
  MapperConfig,
} from '../lib/components/dynamic-mapper';
import {
  LedgerAvenue,
  LedgerStack,
  LedgerConfig,
} from '../lib/components/ledger';
import {
  InstrumentControllerAvenue,
  InstrumentControllerStack,
  InstrumentControllerConfig,
} from '../lib/components/instrument-controller';

import { TeardownLambdaBlock } from '../lib/resources/teardownLambda';
import { TeardownEventBridge } from '../lib/resources/teardownEventbridge';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Role } from 'aws-cdk-lib/aws-iam';

const app = new cdk.App();
const configRootDir: string = path.join(__dirname, '../../config');

const rootDefaultConfig = new ConfigLoader(configRootDir).loadYamlAsObject('default.yaml') as envProps;
const props = rootDefaultConfig.global as PfcProps;

props.deployEnvs!.forEach((env) => {
  const rootTierConfig = new ConfigLoader(configRootDir).loadYamlAsObject(`${env.tier}.yaml`) as envProps;
  const tierProps = rootTierConfig.global as PfcProps;

  env.regions!.forEach((region) => {
    // Load regional configs
    const ingestorConfig = new IngestorConfig(configRootDir).loadProps(env.tier, region);
    const mapperConfig = new MapperConfig(configRootDir).loadProps(env.tier, region);
    const ledgerConfig = new LedgerConfig(configRootDir).loadProps(env.tier, region);
    const instrumentControllerConfig = new InstrumentControllerConfig(configRootDir).loadProps(env.tier, region);

    // Load teardown infrastructure settings from config
    const teardownInfra = new ConfigLoader(configRootDir).loadProps(env.tier, region);
    const {
      lambdaKmsArn,
      vpcId,
      subnetIds,
      securityGroupIds,
    } = teardownInfra;

    // Create avenues if region is us-east-1
    if (region === 'us-east-1') {
      const ingestorAvenueStack = new IngestorAvenue(app, `${env.tier}-avenue-${ingestorConfig.appName}`, ingestorConfig);
      const mapperAvenueStack = new MapperAvenue(app, `${env.tier}-avenue-${mapperConfig.appName}`, mapperConfig);
      const ledgerAvenueStack = new LedgerAvenue(app, `${env.tier}-avenue-${ledgerConfig.appName}`, ledgerConfig);
      const instrumentControllerAvenueStack = new InstrumentControllerAvenue(
        app,
        `${env.tier}-avenue-${instrumentControllerConfig.appName}`,
        instrumentControllerConfig
      );
    }

    // Component stacks
    const ingestorStack = new IngestorStack(app, `${env.tier}-${region}-${ingestorConfig.appName}`, ingestorConfig);
    const mapperStack = new MapperStack(app, `${env.tier}-${region}-${mapperConfig.appName}`, mapperConfig);
    const ledgerStack = new LedgerStack(app, `${env.tier}-${region}-${ledgerConfig.appName}`, ledgerConfig);
    const instrumentControllerStack = new InstrumentControllerStack(
      app,
      `${env.tier}-${region}-${instrumentControllerConfig.appName}`,
      instrumentControllerConfig
    );

    // IAM role for teardown Lambda (you can replace this with PfcAvenueBlock output)
    const teardownRole = Role.fromRoleArn(app, `${env.tier}-${region}-TeardownRole`, 'arn:aws:iam::123456789012:role/teardown-role');

    // Teardown Lambda (self-deletes the stack)
    const teardownLambda = new TeardownLambdaBlock(app, `${env.tier}-${region}-teardownLambda`, {
      id: 'teardown-cleaner',
      functionName: 'teardown-cleaner-fn',
      handler: 'index.handler',
      runtime: Runtime.NODEJS_18_X,
      codePath: path.join(__dirname, '../../lib/lambda/teardown'),
      lambdaKmsArn,
      vpcId,
      subnetIds,
      securityGroupIds,
      role: teardownRole,
      ba: props.ba!,
      component: props.component!,
      ownerContact: props.ownerContact!,
    });

    // Schedule stack deletion via EventBridge in 30 minutes
    const teardownSchedule = new TeardownEventBridge(app, `${env.tier}-${region}-teardownSchedule`, {
      id: `teardown-schedule-${env.tier}-${region}`,
      scheduleName: `teardown-${env.tier}-${region}`,
      lambdaArn: teardownLambda.lambda.functionArn,
      invokeRoleArn: teardownRole.roleArn,
      delayMinutes: 30,
    });
  });

  cdk.Tags.of(app).add('pfc_version', tierProps.pfcVersion!);
});

cdk.Tags.of(app).add('BA', props.ba!);
cdk.Tags.of(app).add('ASV', props.asv!);
cdk.Tags.of(app).add('Component', props.component!);
cdk.Tags.of(app).add('OwnerContact', props.ownerContact!);
if (props.cmdbEnvironment) {
  cdk.Tags.of(app).add('CMDBEnvironment', props.cmdbEnvironment!);
}






/////////ignore

# Node.js dependencies
node_modules/
package-lock.json

# CDK context and outputs
cdk.out/
cdk.context.json

# TypeScript build output
lib/
*.js
*.d.ts
*.js.map

# Local environment files
.env
*.log

# IDE settings
.vscode/
.idea/

# OS files
.DS_Store
Thumbs.db






1. teardownLambda-props.ts

📁 infrastructure/lib/resources/props/teardownLambda-props.ts


import { PfcProps } from './pfc-props';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { ConfigLoader } from '../../util';

export interface TeardownLambdaProps extends PfcProps {
  id: string;
  functionName: string;
  handler: string;
  runtime: Runtime;
  lambdaKmsArn: string;
  codePath: string;
  role: IRole;
  vpcId: string;
  subnetIds: string[];
  securityGroupIds: string[];
  ba: string;
  component: string;
  ownerContact: string;
}

export class TeardownLambdaConfig {
  private configRootDir: string;
  private loader: ConfigLoader;

  constructor(dir: string) {
    this.configRootDir = dir;
    this.loader = new ConfigLoader(dir);
  }

  public loadProps(tier: string, region: string): TeardownLambdaProps {
    const props = this.loader.mergeComponentConfigs('teardown-lambda', tier, region) as TeardownLambdaProps;
    return props;
  }
}




2. teardownLambda.ts

📁 infrastructure/lib/resources/teardownLambda.ts


import { Construct } from 'constructs';
import {
  CofAwsLambdaFunction,
  OnePipelineCode,
} from '@cof/c1-cdk-lib/c1-lambda';
import {
  Vpc,
  SubnetFilter,
  SecurityGroup,
  ISecurityGroup,
} from 'aws-cdk-lib/aws-ec2';
import { Runtime, Function } from 'aws-cdk-lib/aws-lambda';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Stack } from 'aws-cdk-lib';
import { TeardownLambdaProps } from './props/teardownLambda-props';

export class TeardownLambdaBlock extends Construct {
  public readonly lambda: Function;

  constructor(scope: Construct, id: string, props: TeardownLambdaProps) {
    super(scope, id);

    const vpc = Vpc.fromLookup(this, 'Vpc', { vpcId: props.vpcId });
    const subnets = vpc.selectSubnets({
      subnetFilters: [SubnetFilter.byIds(props.subnetIds)],
    });

    const sgList: ISecurityGroup[] = props.securityGroupIds.map((sgId) =>
      SecurityGroup.fromSecurityGroupId(this, `SG-${sgId}`, sgId)
    );

    const kmsKey = Key.fromKeyArn(this, 'TeardownLambdaKms', props.lambdaKmsArn);

    this.lambda = new CofAwsLambdaFunction(this, 'TeardownLambda', {
      functionName: props.functionName,
      runtime: props.runtime ?? Runtime.NODEJS_18_X,
      handler: props.handler,
      vpc,
      vpcSubnets: subnets,
      securityGroups: sgList,
      role: props.role,
      code: OnePipelineCode.fromAsset(props.codePath),
      environmentEncryption: kmsKey,
      businessApplicationName: props.ba,
      componentName: props.component,
      ownerContact: props.ownerContact,
      environment: {
        STACK_NAME: Stack.of(this).stackName,
      },
    });
  }
}



3. teardownEventbridge-props.ts
infrastructure/lib/resources/props/teardownEventbridge-props.ts

export interface TeardownEventBridgeProps {
  id: string;
  scheduleName: string;
  lambdaArn: string;
  invokeRoleArn: string;
  delayMinutes?: number;
}




4. teardownEventbridge.ts

import { Construct } from 'constructs';
import { CfnSchedule } from 'aws-cdk-lib/aws-scheduler';
import { TeardownEventBridgeProps } from './props/teardownEventbridge-props';

export class TeardownEventBridge extends Construct {
  constructor(scope: Construct, id: string, props: TeardownEventBridgeProps) {
    super(scope, id);

    const delayMinutes = props.delayMinutes ?? 30;
    const scheduleTime = new Date(Date.now() + delayMinutes * 60000).toISOString();

    new CfnSchedule(this, 'TeardownScheduler', {
      name: props.scheduleName,
      flexibleTimeWindow: { mode: 'OFF' },
      scheduleExpression: `at(${scheduleTime})`,
      target: {
        arn: props.lambdaArn,
        roleArn: props.invokeRoleArn,
        input: JSON.stringify({}),
      },
    });
  }
}




5. infrastructure/bin/main.ts

#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';

import { ConfigLoader } from '../lib/util';
import { envProps, PfcProps } from '../lib/resources/props/pfc-props';

import {
  IngestorAvenue,
  IngestorStack,
  IngestorConfig,
} from '../lib/components/ingestor';
import {
  MapperAvenue,
  MapperStack,
  MapperConfig,
} from '../lib/components/dynamic-mapper';
import {
  LedgerAvenue,
  LedgerStack,
  LedgerConfig,
} from '../lib/components/ledger';
import {
  InstrumentControllerAvenue,
  InstrumentControllerStack,
  InstrumentControllerConfig,
} from '../lib/components/instrument-controller';

import { TeardownLambdaBlock } from '../lib/resources/teardownLambda';
import { TeardownEventBridge } from '../lib/resources/teardownEventbridge';
import { TeardownLambdaConfig } from '../lib/resources/props/teardownLambda-props';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Role } from 'aws-cdk-lib/aws-iam';

const app = new cdk.App();
const configRootDir: string = path.join(__dirname, '../../config');

const rootDefaultConfig = new ConfigLoader(configRootDir).loadYamlAsObject('default.yaml') as envProps;
const props = rootDefaultConfig.global as PfcProps;

props.deployEnvs!.forEach((env) => {
  const rootTierConfig = new ConfigLoader(configRootDir).loadYamlAsObject(`${env.tier}.yaml`) as envProps;
  const tierProps = rootTierConfig.global as PfcProps;

  env.regions!.forEach((region) => {
    const ingestorConfig = new IngestorConfig(configRootDir).loadProps(env.tier, region);
    const mapperConfig = new MapperConfig(configRootDir).loadProps(env.tier, region);
    const ledgerConfig = new LedgerConfig(configRootDir).loadProps(env.tier, region);
    const instrumentControllerConfig = new InstrumentControllerConfig(configRootDir).loadProps(env.tier, region);

    const teardownConfig = new TeardownLambdaConfig(configRootDir);
    const teardownProps = teardownConfig.loadProps(env.tier, region);

    if (region === 'us-east-1') {
      const ingestorAvenueStack = new IngestorAvenue(app, `${env.tier}-avenue-${ingestorConfig.appName}`, ingestorConfig);
      const mapperAvenueStack = new MapperAvenue(app, `${env.tier}-avenue-${mapperConfig.appName}`, mapperConfig);
      const ledgerAvenueStack = new LedgerAvenue(app, `${env.tier}-avenue-${ledgerConfig.appName}`, ledgerConfig);
      const instrumentControllerAvenueStack = new InstrumentControllerAvenue(
        app,
        `${env.tier}-avenue-${instrumentControllerConfig.appName}`,
        instrumentControllerConfig
      );
    }

    const ingestorStack = new IngestorStack(app, `${env.tier}-${region}-${ingestorConfig.appName}`, ingestorConfig);
    const mapperStack = new MapperStack(app, `${env.tier}-${region}-${mapperConfig.appName}`, mapperConfig);
    const ledgerStack = new LedgerStack(app, `${env.tier}-${region}-${ledgerConfig.appName}`, ledgerConfig);
    const instrumentControllerStack = new InstrumentControllerStack(
      app,
      `${env.tier}-${region}-${instrumentControllerConfig.appName}`,
      instrumentControllerConfig
    );

    const teardownRole = Role.fromRoleArn(app, `${env.tier}-${region}-TeardownRole`, teardownProps.role.roleArn);

    const teardownLambda = new TeardownLambdaBlock(app, `${env.tier}-${region}-teardownLambda`, {
      ...teardownProps,
      role: teardownRole,
      codePath: path.join(__dirname, '../../lib/lambda/teardown'),
    });

    const teardownSchedule = new TeardownEventBridge(app, `${env.tier}-${region}-teardownSchedule`, {
      id: `teardown-schedule-${env.tier}-${region}`,
      scheduleName: `teardown-${env.tier}-${region}`,
      lambdaArn: teardownLambda.lambda.functionArn,
      invokeRoleArn: teardownRole.roleArn,
      delayMinutes: 30,
    });
  });

  cdk.Tags.of(app).add('pfc_version', tierProps.pfcVersion!);
});

cdk.Tags.of(app).add('BA', props.ba!);
cdk.Tags.of(app).add('ASV', props.asv!);
cdk.Tags.of(app).add('Component', props.component!);
cdk.Tags.of(app).add('OwnerContact', props.ownerContact!);
if (props.cmdbEnvironment) {
  cdk.Tags.of(app).add('CMDBEnvironment', props.cmdbEnvironment!);
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





