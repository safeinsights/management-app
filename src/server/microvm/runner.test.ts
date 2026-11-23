import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
    GetObjectCommand,
    NoSuchKey,
    PutObjectCommand,
    S3Client,
    type GetObjectCommandOutput,
} from '@aws-sdk/client-s3'
import {
    CreateMicrovmAuthTokenCommand,
    GetMicrovmCommand,
    LambdaMicrovmsClient,
    RunMicrovmCommand,
} from '@aws-sdk/client-lambda-microvms'
import { db } from '@/database'
import { insertTestCodeEnv, insertTestStudyOnly } from '@/tests/unit.helpers'
import { ensureRunner } from './runner'

const config = {
    executionRoleArn: 'arn:aws:iam::123456789012:role/exec',
    egressConnectorArn: 'arn:aws:lambda:us-east-1:123456789012:network-connector:abc',
    workspacesBucket: 'workspaces',
    runnerLogGroup: '/aws/lambda-microvms/runner-test',
}
// Plain functions: the suite resets vi.fn() implementations between tests.
vi.mock('./config', () => ({ getMicrovmConfig: async () => config, isMicrovmBackend: () => true }))
vi.mock('./workspaces', () => ({ studyEnvironment: async () => ({ DATA_PATH: 's3://bucket/sample' }) }))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: async () => 'https://s3/launch-config' }))

const s3 = mockClient(S3Client)
const microvms = mockClient(LambdaMicrovmsClient)
const imageArn = 'arn:aws:lambda:us-east-1:123456789012:microvm-image:runner-test-0123456789abcdef'
const body = (value: object) =>
    ({ transformToString: async () => JSON.stringify(value) }) as unknown as GetObjectCommandOutput['Body']

// A study on an R code environment whose image is built, at version 2.0.
const studyWithImage = async (image: { imageVersion: string | null; status?: 'IMAGE-READY' | 'IMAGE-RUNNING' }) => {
    const { org, study } = await insertTestStudyOnly()
    const codeEnv = await insertTestCodeEnv({ orgId: org.id, language: 'R', url: `example.com/r:${randomUUID()}` })
    await db
        .insertInto('microvmImage')
        .values({
            url: codeEnv.url,
            status: image.status ?? 'IMAGE-READY',
            imageArn: image.imageVersion ? imageArn : null,
            imageVersion: image.imageVersion,
        })
        .execute()
    return study
}

beforeEach(() => {
    s3.reset()
    microvms.reset()
    s3.on(GetObjectCommand).rejects(new NoSuchKey({ message: 'none', $metadata: {} }))
    s3.on(PutObjectCommand).resolves({})
    microvms.on(RunMicrovmCommand).resolves({ microvmId: 'runner-new' })
    microvms.on(GetMicrovmCommand).resolves({ state: 'RUNNING', endpoint: 'abc.lambda-microvm.example' })
    microvms.on(CreateMicrovmAuthTokenCommand).resolves({ authToken: { 'X-aws-proxy-auth': 'the-runner-token' } })
})

describe('ensureRunner', () => {
    it('says why there is no runner when the image is not built', async () => {
        const study = await studyWithImage({ imageVersion: null, status: 'IMAGE-RUNNING' })

        const answer = await ensureRunner(study.id, db)

        expect(answer).toEqual({
            ready: false,
            message: 'The run environment is not ready. It is being built. Try again in a few minutes.',
        })
        expect(microvms.commandCalls(RunMicrovmCommand)).toHaveLength(0)
    })

    it('starts a runner from the image of the study url, and answers with a way to it', async () => {
        const study = await studyWithImage({ imageVersion: '2.0' })

        const answer = await ensureRunner(study.id, db)

        const [run] = microvms.commandCalls(RunMicrovmCommand)
        expect(run.args[0].input).toMatchObject({
            imageIdentifier: imageArn,
            imageVersion: '2.0',
            executionRoleArn: config.executionRoleArn,
            egressNetworkConnectors: [config.egressConnectorArn],
            idlePolicy: { maxIdleDurationSeconds: 20 * 60, autoResumeEnabled: true },
            logging: { cloudWatch: { logGroup: config.runnerLogGroup } },
        })
        expect(answer).toMatchObject({
            ready: true,
            endpoint: 'https://abc.lambda-microvm.example',
            token: 'the-runner-token',
            commandLines: { r: 'Rscript %f' },
        })
    })

    // The service logs the run hook payload, and the variables hold the sample-data credentials.
    it('hands the study variables to the runner by a short-lived address, not in the payload', async () => {
        const study = await studyWithImage({ imageVersion: '2.0' })

        await ensureRunner(study.id, db)

        const [run] = microvms.commandCalls(RunMicrovmCommand)
        expect(JSON.parse(run.args[0].input.runHookPayload!)).toEqual({ c: 'https://s3/launch-config' })
        const config = s3
            .commandCalls(PutObjectCommand)
            .find((call) => String(call.args[0].input.Key).startsWith('launch/'))
        expect(JSON.parse(String(config!.args[0].input.Body))).toEqual({ env: { DATA_PATH: 's3://bucket/sample' } })
    })

    it('makes the token for the runner port only, for one hour', async () => {
        const study = await studyWithImage({ imageVersion: '2.0' })
        const before = Date.now()

        const answer = await ensureRunner(study.id, db)

        const [token] = microvms.commandCalls(CreateMicrovmAuthTokenCommand)
        expect(token.args[0].input).toEqual({
            microvmIdentifier: 'runner-new',
            expirationInMinutes: 60,
            allowedPorts: [{ port: 8080 }],
        })
        if (!answer.ready) throw new Error('not ready')
        expect(answer.expiresAt).toBeGreaterThanOrEqual(before + 59 * 60_000)
    })

    it('records the runner so that the next request finds it', async () => {
        const study = await studyWithImage({ imageVersion: '2.0' })

        await ensureRunner(study.id, db)

        const record = s3
            .commandCalls(PutObjectCommand)
            .find((call) => call.args[0].input.Key === `studies/${study.id}/runner.json`)
        expect(JSON.parse(String(record!.args[0].input.Body))).toEqual({ microvmId: 'runner-new', imageVersion: '2.0' })
    })

    it.each(['RUNNING', 'SUSPENDED'] as const)('uses the runner the study has when it is %s', async (state) => {
        const study = await studyWithImage({ imageVersion: '2.0' })
        s3.on(GetObjectCommand, { Key: `studies/${study.id}/runner.json` }).resolves({
            Body: body({ microvmId: 'runner-old', imageVersion: '2.0' }),
        })
        microvms.on(GetMicrovmCommand).resolves({ state, endpoint: 'old.lambda-microvm.example' })

        const answer = await ensureRunner(study.id, db)

        expect(microvms.commandCalls(RunMicrovmCommand)).toHaveLength(0)
        expect(answer).toMatchObject({ ready: true, endpoint: 'https://old.lambda-microvm.example' })
        expect(microvms.commandCalls(CreateMicrovmAuthTokenCommand)[0].args[0].input.microvmIdentifier).toBe(
            'runner-old',
        )
    })

    // An org admin changed the image, or the agent changed. Code must not go on running on the old one.
    it('starts a new runner when the image has a newer version', async () => {
        const study = await studyWithImage({ imageVersion: '3.0' })
        s3.on(GetObjectCommand, { Key: `studies/${study.id}/runner.json` }).resolves({
            Body: body({ microvmId: 'runner-old', imageVersion: '2.0' }),
        })

        await ensureRunner(study.id, db)

        expect(microvms.commandCalls(RunMicrovmCommand)[0].args[0].input.imageVersion).toBe('3.0')
    })

    it('starts a new runner when the one on record has ended', async () => {
        const study = await studyWithImage({ imageVersion: '2.0' })
        s3.on(GetObjectCommand, { Key: `studies/${study.id}/runner.json` }).resolves({
            Body: body({ microvmId: 'runner-old', imageVersion: '2.0' }),
        })
        microvms.on(GetMicrovmCommand, { microvmIdentifier: 'runner-old' }).resolves({ state: 'TERMINATED' })
        microvms.on(GetMicrovmCommand, { microvmIdentifier: 'runner-new' }).resolves({
            state: 'RUNNING',
            endpoint: 'abc.lambda-microvm.example',
        })

        await ensureRunner(study.id, db)

        expect(microvms.commandCalls(RunMicrovmCommand)).toHaveLength(1)
    })
})
