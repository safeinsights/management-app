import { beforeEach, expect, it, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { LambdaMicrovmsClient, RunMicrovmCommand } from '@aws-sdk/client-lambda-microvms'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { ensureMicrovm } from './workspaces'

vi.mock('@/server/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/config')>()),
    CODER_DISABLED: false,
}))
vi.stubEnv('IDE_BACKEND', 'microvm')
vi.mock('@/server/coder/workspaces', () => ({
    buildWorkspaceEnvironment: async () => [],
    initializeWorkspaceCodeFiles: async () => undefined,
}))
vi.mock('@/server/workspace-files', () => ({
    listStudyFiles: async () => [],
    studyFileStore: async () => ({}),
}))
vi.mock('@/server/db/queries', () => ({ fetchCodeEnvForStudyId: async () => ({}) }))
// Plain functions, not vi.fn(): the suite resets mock implementations between tests.
vi.mock('@/server/request-context', () => ({ currentDb: () => ({}) }))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: async () => 'https://s3/config' }))

const ssm = mockClient(SSMClient)
const s3 = mockClient(S3Client)
const microvms = mockClient(LambdaMicrovmsClient)
const secrets = mockClient(SecretsManagerClient)
const studyId = '01a11e77-c475-76d9-a1c2-765bf7fd232d'

beforeEach(() => {
    for (const client of [ssm, s3, microvms, secrets]) client.reset()
    ssm.on(GetParameterCommand).resolves({
        Parameter: {
            Value: JSON.stringify({
                imageArn: 'arn:aws:lambda:us-east-1:123456789012:microvm-image:research-ide-test',
                executionRoleArn: 'arn:aws:iam::123456789012:role/exec',
                egressConnectorArn: 'arn:aws:lambda:us-east-1:123456789012:network-connector:abc',
                sampleDataSecrets: [],
                workspacesBucket: 'workspaces',
                logGroup: '/aws/lambda-microvms/ide-test',
                claudeApiKeySecret: '',
            }),
        },
    })
    secrets.on(GetSecretValueCommand).resolves({ SecretString: '{}' })
    // No record: the study has no live MicroVM, so a launch is needed.
    s3.on(GetObjectCommand).rejects(new NoSuchKey({ message: 'none', $metadata: {} }))
    s3.on(PutObjectCommand).resolves({})
    microvms.on(RunMicrovmCommand).resolves({ microvmId: 'microvm-new' })
})

// The IDE is SafeInsights' own image for every study. A study's code runs on its runner, so the
// state of the code environment's image must not stand between a researcher and the editor.
it('launches the IDE from the one SafeInsights image, whatever the state of the run environment', async () => {
    expect(await ensureMicrovm(studyId)).toEqual({ microvmId: 'microvm-new' })

    const [run] = microvms.commandCalls(RunMicrovmCommand)
    expect(run.args[0].input.imageIdentifier).toBe(
        'arn:aws:lambda:us-east-1:123456789012:microvm-image:research-ide-test',
    )
    expect(run.args[0].input.imageVersion).toBeUndefined()
})
