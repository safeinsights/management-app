import { beforeEach, expect, it, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { LambdaMicrovmsClient, RunMicrovmCommand } from '@aws-sdk/client-lambda-microvms'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { requireIdeImage } from './images'
import { ensureMicrovm } from './workspaces'

vi.mock('@/server/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/config')>()),
    CODER_DISABLED: false,
}))
vi.stubEnv('IDE_BACKEND', 'microvm')
vi.mock('./images', () => ({ requireIdeImage: vi.fn() }))
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

it('runs the study on the image and version built for its code environment url', async () => {
    vi.mocked(requireIdeImage).mockResolvedValue({ imageArn: 'arn:image:ide-test-abc', imageVersion: '4.0' })

    expect(await ensureMicrovm(studyId)).toEqual({ microvmId: 'microvm-new' })

    const [run] = microvms.commandCalls(RunMicrovmCommand)
    expect(run.args[0].input).toMatchObject({ imageIdentifier: 'arn:image:ide-test-abc', imageVersion: '4.0' })
})

// The check comes first: nothing is written to S3 and no MicroVM is started for an image that is not there.
it('starts nothing when the image is not ready', async () => {
    vi.mocked(requireIdeImage).mockRejectedValue(new Error('The environment is not ready.'))

    await expect(ensureMicrovm(studyId)).rejects.toThrow('The environment is not ready.')

    expect(microvms.commandCalls(RunMicrovmCommand)).toHaveLength(0)
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0)
})
