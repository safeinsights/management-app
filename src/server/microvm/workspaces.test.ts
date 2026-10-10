import { createHash, createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import {
    DeleteObjectCommand,
    GetObjectCommand,
    type GetObjectCommandOutput,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3'
import { GetMicrovmCommand, LambdaMicrovmsClient } from '@aws-sdk/client-lambda-microvms'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { applyMicrovmFileSync, getMicrovmLaunchStatus } from './workspaces'

vi.mock('@/server/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/config')>()),
    CODER_DISABLED: false,
}))
vi.stubEnv('IDE_BACKEND', 'microvm')

const ssm = mockClient(SSMClient)
const s3 = mockClient(S3Client)
const microvms = mockClient(LambdaMicrovmsClient)
const secrets = mockClient(SecretsManagerClient)

const config = {
    imageArn: 'arn:aws:lambda:us-east-1:123456789012:microvm-image:crate-ide-sandbox',
    executionRoleArn: 'arn:aws:iam::123456789012:role/exec',
    egressConnectorArn: 'arn:aws:lambda:us-east-1:123456789012:network-connector:abc',
    sampleDataSecrets: [],
    workspacesBucket: 'workspaces',
    logGroup: '/aws/lambda-microvms/crate-ide-sandbox',
    ideDomain: 'ide.example.cloudfront.net',
    claudeApiKeySecret: '',
    launchTokenSecret: 'MicrovmLaunchTokenKey',
}
const launchKey = 'the-launch-key'
const userId = 'user-1'
const studyId = '01a11e77-c475-76d9-a1c2-765bf7fd232d'
const microvmId = 'microvm-abc'
const syncToken = 'the-microvm-token'
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

const recordBody = (record: object) =>
    ({ transformToString: async () => JSON.stringify(record) }) as unknown as GetObjectCommandOutput['Body']

beforeEach(() => {
    ssm.reset()
    s3.reset()
    microvms.reset()
    secrets.reset()
    secrets.on(GetSecretValueCommand, { SecretId: config.launchTokenSecret }).resolves({ SecretString: launchKey })
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: JSON.stringify(config) } })
    s3.on(GetObjectCommand, { Key: `studies/${studyId}/microvm.json` }).resolves({
        Body: recordBody({ microvmId, syncTokenHash: sha256(syncToken) }),
    })
})

describe('applyMicrovmFileSync', () => {
    const sync = {
        studyId,
        files: [{ path: 'main.R', content: Buffer.from('print(1)\n').toString('base64'), mtime: 1_800_000_000 }],
        deleted: ['old.R'],
    }

    it('refuses a token other than the one the MicroVM was launched with', async () => {
        expect(await applyMicrovmFileSync(sync, 'someone-else')).toBe(false)
        expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0)
        expect(s3.commandCalls(DeleteObjectCommand)).toHaveLength(0)
    })

    it('writes changed files with their mtime and removes deleted ones', async () => {
        expect(await applyMicrovmFileSync(sync, syncToken)).toBe(true)

        const [put] = s3.commandCalls(PutObjectCommand)
        expect(put.args[0].input).toMatchObject({
            Bucket: 'workspaces',
            Key: `studies/${studyId}/files/main.R`,
            Metadata: { mtime: '1800000000' },
        })
        expect(s3.commandCalls(DeleteObjectCommand)[0].args[0].input.Key).toBe(`studies/${studyId}/files/old.R`)
    })

    it('ignores names that reach outside the study directory', async () => {
        await applyMicrovmFileSync(
            { studyId, files: [{ ...sync.files[0], path: '../x/main.R' }], deleted: ['a/b'] },
            syncToken,
        )
        expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0)
        expect(s3.commandCalls(DeleteObjectCommand)).toHaveLength(0)
    })
})

describe('getMicrovmLaunchStatus', () => {
    it('hands back an IDE url carrying a launch token for the study once the MicroVM runs', async () => {
        microvms.on(GetMicrovmCommand).resolves({ state: 'RUNNING' })

        const status = await getMicrovmLaunchStatus(studyId, userId)

        expect(status.ready).toBe(true)
        const url = new URL(status.url!)
        expect(`${url.origin}${url.pathname}`).toBe(`https://${config.ideDomain}/_auth/${studyId}/`)
        const [payload, signature] = url.searchParams.get('t')!.split('.')
        expect(signature).toBe(createHmac('sha256', launchKey).update(payload).digest('base64url'))
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
        expect(claims).toMatchObject({ study: studyId, user: userId })
        expect(claims.exp).toBeGreaterThan(Date.now() / 1000)
    })

    it('treats a suspended MicroVM as ready, since it resumes on the first request', async () => {
        microvms.on(GetMicrovmCommand).resolves({ state: 'SUSPENDED' })
        expect((await getMicrovmLaunchStatus(studyId, userId)).ready).toBe(true)
    })

    it('fails when the MicroVM has terminated', async () => {
        microvms.on(GetMicrovmCommand).resolves({ state: 'TERMINATED', stateReason: 'max duration' })

        const status = await getMicrovmLaunchStatus(studyId, userId)

        expect(status.failed).toBe(true)
        expect(status.url).toBeNull()
    })
})
