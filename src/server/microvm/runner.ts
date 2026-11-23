import { randomUUID } from 'node:crypto'
import {
    AccessDeniedException,
    CreateMicrovmAuthTokenCommand,
    GetMicrovmCommand,
    LambdaMicrovmsClient,
    ResourceNotFoundException,
    RunMicrovmCommand,
    type MicrovmState,
} from '@aws-sdk/client-lambda-microvms'
import { GetObjectCommand, NoSuchKey, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { DBExecutor } from '@/database'
import type { CommandLines } from '@/database/types-manual'
import { ActionFailure } from '@/lib/errors'
import logger from '@/lib/logger'
import { getS3Client } from '@/server/aws'
import { env } from '@/server/config'
import { fetchCodeEnvForStudyId } from '@/server/db/queries'
import { getMicrovmConfig, type MicrovmConfig } from './config'
import { requireRunnerImage } from './images'
import { studyEnvironment } from './workspaces'

// The runner is the study's code environment image with the run agent; see iac's microvm/runner.
// The IDE's terminal is a session on it, and the two keep the study folder equal.

// The agent's port for the IDE. Its lifecycle hooks are on another port, which no token opens.
const RUNNER_PORT = 8080
const TOKEN_MINUTES = 60
// Longer than the IDE's own 15 minutes, so a runner is not suspended under an IDE still in use.
const MAX_IDLE_SECONDS = 20 * 60
const MAX_DURATION_SECONDS = 8 * 60 * 60
const START_WAIT_MS = 15_000
const START_POLL_MS = 250
// A runner in one of these states still has the study's session and files.
const REUSABLE: MicrovmState[] = ['PENDING', 'RUNNING', 'SUSPENDING', 'SUSPENDED']

export type RunnerAnswer =
    | { ready: true; id: string; endpoint: string; token: string; expiresAt: number; commandLines: CommandLines }
    | { ready: false; message: string }

type RunnerRecord = { microvmId: string; imageVersion: string }

const recordKey = (studyId: string) => `studies/${studyId}/runner.json`
const managedConnector = (name: string) =>
    `arn:aws:lambda:${env.AWS_REGION || 'us-east-1'}:aws:network-connector:aws-network-connector:${name}`

let client: LambdaMicrovmsClient | undefined
const microvms = () => (client ??= new LambdaMicrovmsClient())

async function readRecord(bucket: string, studyId: string): Promise<RunnerRecord | null> {
    try {
        const object = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: recordKey(studyId) }))
        return JSON.parse(await object.Body!.transformToString())
    } catch (e) {
        if (e instanceof NoSuchKey) return null
        throw e
    }
}

async function runnerVm(microvmId: string): Promise<{ state: MicrovmState; endpoint?: string } | null> {
    try {
        const vm = await microvms().send(new GetMicrovmCommand({ microvmIdentifier: microvmId }))
        return { state: vm.state!, endpoint: vm.endpoint }
    } catch (e) {
        // Access is granted per image, so a runner whose image was deleted is unreadable.
        if (e instanceof ResourceNotFoundException || e instanceof AccessDeniedException) return null
        throw e
    }
}

async function startRunner(
    config: MicrovmConfig,
    studyId: string,
    image: { imageArn: string; imageVersion: string },
): Promise<RunnerRecord> {
    // The variables hold the sample-data credentials, and the service logs the run hook payload, so
    // the agent reads them from a short-lived address instead.
    const configKey = `launch/${randomUUID()}.json`
    await getS3Client().send(
        new PutObjectCommand({
            Bucket: config.workspacesBucket,
            Key: configKey,
            Body: JSON.stringify({ env: await studyEnvironment(config, studyId) }),
        }),
    )
    const configUrl = await getSignedUrl(
        getS3Client(),
        new GetObjectCommand({ Bucket: config.workspacesBucket, Key: configKey }),
        { expiresIn: 300 },
    )
    const run = await microvms().send(
        new RunMicrovmCommand({
            imageIdentifier: image.imageArn,
            imageVersion: image.imageVersion,
            executionRoleArn: config.executionRoleArn,
            ingressNetworkConnectors: [managedConnector('HTTP_INGRESS')],
            // Through the VPC, so code reaches the sample-data databases as it does in the IDE.
            egressNetworkConnectors: [config.egressConnectorArn],
            idlePolicy: {
                maxIdleDurationSeconds: MAX_IDLE_SECONDS,
                suspendedDurationSeconds: MAX_DURATION_SECONDS,
                autoResumeEnabled: true,
            },
            logging: { cloudWatch: { logGroup: config.runnerLogGroup } },
            maximumDurationInSeconds: MAX_DURATION_SECONDS,
            runHookPayload: JSON.stringify({ c: configUrl }),
            clientToken: randomUUID(),
        }),
    )
    const record: RunnerRecord = { microvmId: run.microvmId!, imageVersion: image.imageVersion }
    await getS3Client().send(
        new PutObjectCommand({
            Bucket: config.workspacesBucket,
            Key: recordKey(studyId),
            Body: JSON.stringify(record),
        }),
    )
    logger.info(`[microvm-runner study=${studyId}] started ${record.microvmId} on image version ${record.imageVersion}`)
    return record
}

async function waitUntilStarted(microvmId: string) {
    const deadline = Date.now() + START_WAIT_MS
    for (;;) {
        const vm = await runnerVm(microvmId)
        if (!vm || vm.state !== 'PENDING' || Date.now() > deadline) return vm
        await new Promise((resolve) => setTimeout(resolve, START_POLL_MS))
    }
}

/**
 * The study's runner, started if it has none, with a token that reaches it and nothing else.
 * The caller has already proved which study it is (verifySyncToken): nothing here is named by it.
 */
export async function ensureRunner(studyId: string, db: DBExecutor): Promise<RunnerAnswer> {
    const config = await getMicrovmConfig()
    if (!config) return { ready: false, message: 'The run environment is not available here.' }

    let image
    try {
        image = await requireRunnerImage(studyId, db)
    } catch (e) {
        if (e instanceof ActionFailure) return { ready: false, message: e.message }
        throw e
    }

    let record = await readRecord(config.workspacesBucket, studyId)
    // A runner that is in use keeps the image version it started with. A researcher's terminals are
    // sessions on that VM; a new image version reaches the study when this runner has ended.
    let vm = record ? await runnerVm(record.microvmId) : null
    if (!record || !vm || !REUSABLE.includes(vm.state)) {
        record = await startRunner(config, studyId, image)
        vm = await waitUntilStarted(record.microvmId)
    }
    if (!vm?.endpoint || vm.state === 'PENDING') {
        return { ready: false, message: 'The run environment is starting.' }
    }

    const auth = await microvms().send(
        new CreateMicrovmAuthTokenCommand({
            microvmIdentifier: record.microvmId,
            expirationInMinutes: TOKEN_MINUTES,
            allowedPorts: [{ port: RUNNER_PORT }],
        }),
    )
    const { commandLines } = await fetchCodeEnvForStudyId(studyId, db)
    return {
        ready: true,
        // The IDE's sync keeps a record for one runner; a new id tells it the record is void.
        id: record.microvmId,
        endpoint: vm.endpoint.startsWith('https://') ? vm.endpoint : `https://${vm.endpoint}`,
        token: auth.authToken!['X-aws-proxy-auth'],
        expiresAt: Date.now() + TOKEN_MINUTES * 60_000,
        commandLines,
    }
}
