import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import {
    GetMicrovmCommand,
    LambdaMicrovmsClient,
    ResourceNotFoundException,
    RunMicrovmCommand,
    type MicrovmState,
} from '@aws-sdk/client-lambda-microvms'
import { GetObjectCommand, NoSuchKey, PutObjectCommand } from '@aws-sdk/client-s3'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getS3Client } from '@/server/aws'
import { APP_BASE_URL } from '@/server/config'
import { fetchLatestCodeEnvForStudyId } from '@/server/db/queries'
import { buildWorkspaceEnvironment, initializeWorkspaceCodeFiles } from '@/server/coder/workspaces'
import type { WorkspaceLaunchStatus } from '@/server/coder/types'
import { listStudyFiles, studyFileStore } from '@/server/workspace-files'
import logger from '@/lib/logger'
import { getMicrovmConfig, type MicrovmConfig } from './config'

// The platform maximum. A MicroVM idle this long is suspended, and one suspended this long is
// terminated; its files are already in S3 by then.
const MAX_DURATION_SECONDS = 8 * 60 * 60
const MAX_IDLE_SECONDS = 15 * 60
const RUN_HOOK_PAYLOAD_LIMIT = 4096
// Long enough to cover a restore from snapshot, short of the Lambda's 30 s timeout.
const READY_WAIT_MS = 15_000
const READY_POLL_MS = 200
// A reusable MicroVM still holds the study's files; any other state needs a fresh launch.
const LIVE_STATES: MicrovmState[] = ['PENDING', 'RUNNING', 'SUSPENDING', 'SUSPENDED']

type MicrovmRecord = { microvmId: string; syncTokenHash: string }

const recordKey = (studyId: string) => `studies/${studyId}/microvm.json`
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const managedConnector = (name: string) =>
    `arn:aws:lambda:${process.env.AWS_REGION || 'us-east-1'}:aws:network-connector:aws-network-connector:${name}`

let microvmsClient: LambdaMicrovmsClient | undefined
const microvms = () => (microvmsClient ??= new LambdaMicrovmsClient())

async function requireConfig(): Promise<MicrovmConfig> {
    const config = await getMicrovmConfig()
    if (!config) throw new Error('MicroVM IDE is not enabled in this environment')
    return config
}

async function readRecord(bucket: string, studyId: string): Promise<MicrovmRecord | null> {
    try {
        const object = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: recordKey(studyId) }))
        return JSON.parse(await object.Body!.transformToString())
    } catch (e) {
        if (e instanceof NoSuchKey) return null
        throw e
    }
}

async function microvmState(microvmId: string): Promise<{ state: MicrovmState; reason?: string } | null> {
    try {
        const vm = await microvms().send(new GetMicrovmCommand({ microvmIdentifier: microvmId }))
        return { state: vm.state!, reason: vm.stateReason }
    } catch (e) {
        if (e instanceof ResourceNotFoundException) return null
        throw e
    }
}

let secretsClient: SecretsManagerClient | undefined
const secretString = async (name: string) => {
    secretsClient ??= new SecretsManagerClient()
    const { SecretString } = await secretsClient.send(new GetSecretValueCommand({ SecretId: name }))
    return SecretString
}

async function claudeApiKey(config: MicrovmConfig): Promise<string | undefined> {
    return config.claudeApiKeySecret ? secretString(config.claudeApiKeySecret) : undefined
}

// Each sample-data secret holds one <PARTNER>_<DB>_DB_URL key, which the Coder template exposed as an
// environment variable of the same name. A database whose secret is missing is skipped rather than
// failing the launch, as a cluster may not be deployed in every environment.
async function sampleDataEnvironment(config: MicrovmConfig): Promise<Record<string, string>> {
    const entries = await Promise.all(
        config.sampleDataSecrets.map(async (name) => {
            try {
                return Object.entries(JSON.parse((await secretString(name)) ?? '{}') as Record<string, string>)
            } catch (e) {
                logger.warn(`[microvm] sample data secret ${name} unavailable:`, e)
                return []
            }
        }),
    )
    return Object.fromEntries(entries.flat())
}

async function studyPayload(studyId: string) {
    const store = await studyFileStore()
    const files = await Promise.all(
        (await listStudyFiles(studyId)).map(async (file) => ({
            path: file.name,
            content: (await store.read(studyId, file.name))!.toString('base64'),
            mtime: Math.floor(file.mtime.getTime() / 1000),
        })),
    )
    const environment = await buildWorkspaceEnvironment(await fetchLatestCodeEnvForStudyId(studyId))
    return { files, env: Object.fromEntries(environment.map(({ name, value }) => [name, value])) }
}

// Secrets stay out of the run hook payload, which Lambda logs and keeps with the MicroVM.
async function launchSecrets(config: MicrovmConfig) {
    const [apiKey, sampleData] = await Promise.all([claudeApiKey(config), sampleDataEnvironment(config)])
    return { claudeApiKey: apiKey, env: sampleData }
}

async function launchMicrovm(config: MicrovmConfig, studyId: string): Promise<string> {
    const logCtx = `[microvm-launch study=${studyId}]`
    await initializeWorkspaceCodeFiles(studyId)
    const study = await studyPayload(studyId)

    const syncToken = randomBytes(32).toString('base64url')
    const configKey = `launch/${randomUUID()}.json`
    const configUrl = await getSignedUrl(
        getS3Client(),
        new GetObjectCommand({ Bucket: config.workspacesBucket, Key: configKey }),
        { expiresIn: 300 },
    )
    // The study rides in the payload when it fits, so the MicroVM's /run hook needs no network call.
    const inline = JSON.stringify({ f: gzipSync(JSON.stringify(study)).toString('base64'), c: configUrl })
    const fitsInline = inline.length <= RUN_HOOK_PAYLOAD_LIMIT
    const launchConfig = {
        study: fitsInline ? undefined : study,
        ...(await launchSecrets(config)),
        sync: { url: `${APP_BASE_URL}/api/microvm/files`, token: syncToken, identity: { studyId } },
    }
    await getS3Client().send(
        new PutObjectCommand({ Bucket: config.workspacesBucket, Key: configKey, Body: JSON.stringify(launchConfig) }),
    )

    const run = await microvms().send(
        new RunMicrovmCommand({
            imageIdentifier: config.imageArn,
            executionRoleArn: config.executionRoleArn,
            ingressNetworkConnectors: [managedConnector('HTTP_INGRESS')],
            // Through the VPC, so the IDE reaches the sample-data databases as Coder workspaces did.
            egressNetworkConnectors: [config.egressConnectorArn],
            idlePolicy: {
                maxIdleDurationSeconds: MAX_IDLE_SECONDS,
                suspendedDurationSeconds: MAX_DURATION_SECONDS,
                autoResumeEnabled: true,
            },
            logging: { cloudWatch: { logGroup: config.logGroup } },
            maximumDurationInSeconds: MAX_DURATION_SECONDS,
            runHookPayload: fitsInline ? inline : JSON.stringify({ c: configUrl }),
            clientToken: randomUUID(),
        }),
    )
    const record: MicrovmRecord = { microvmId: run.microvmId!, syncTokenHash: sha256(syncToken) }
    await getS3Client().send(
        new PutObjectCommand({
            Bucket: config.workspacesBucket,
            Key: recordKey(studyId),
            Body: JSON.stringify(record),
        }),
    )
    logger.info(`${logCtx} started ${record.microvmId} (study ${fitsInline ? 'inline' : 'in config'})`)
    return record.microvmId
}

/** Starts a MicroVM for the study unless one that still holds its files is running or suspended. */
export async function ensureMicrovm(studyId: string): Promise<{ microvmId: string }> {
    const config = await requireConfig()
    const record = await readRecord(config.workspacesBucket, studyId)
    if (record) {
        const vm = await microvmState(record.microvmId)
        if (vm && LIVE_STATES.includes(vm.state)) return { microvmId: record.microvmId }
    }
    return { microvmId: await launchMicrovm(config, studyId) }
}

const status = (
    fields: Partial<WorkspaceLaunchStatus> & Pick<WorkspaceLaunchStatus, 'reason'>,
): WorkspaceLaunchStatus => ({
    buildStatus: 'running',
    buildLogLines: [],
    agentStatus: null,
    agentLogLines: [],
    ready: false,
    failed: false,
    cursors: { build: null, agent: null },
    url: null,
    ...fields,
})

/**
 * Waits for the study's MicroVM to start, then returns the IDE url. The url carries the researcher's
 * short-lived Clerk session token, which the IDE's CloudFront login exchanges for access cookies.
 */
export async function getMicrovmLaunchStatus(studyId: string, sessionToken: string): Promise<WorkspaceLaunchStatus> {
    const config = await requireConfig()
    const record = await readRecord(config.workspacesBucket, studyId)
    if (!record) return status({ failed: true, buildStatus: 'failed', reason: 'no MicroVM has been launched' })

    const deadline = Date.now() + READY_WAIT_MS
    for (;;) {
        const vm = await microvmState(record.microvmId)
        if (!vm || !LIVE_STATES.includes(vm.state)) {
            const reason = `MicroVM ${record.microvmId} is ${vm?.state ?? 'gone'}: ${vm?.reason ?? ''}`
            return status({ failed: true, buildStatus: 'failed', reason })
        }
        // A suspended MicroVM resumes on its first request, so it is as good as running.
        if (vm.state !== 'PENDING') {
            const url = `https://${config.ideDomain}/_auth/${record.microvmId}/?t=${encodeURIComponent(sessionToken)}`
            return status({ ready: true, reason: `MicroVM ${vm.state}`, url })
        }
        if (Date.now() > deadline) return status({ reason: 'MicroVM is starting' })
        await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS))
    }
}

// Study files are top-level, so anything naming a directory is not one.
const PLAIN_FILE_NAME = /^[^/\\]+$/

export type MicrovmFileSync = {
    studyId: string
    files: Array<{ path: string; content: string; mtime: number }>
    deleted: string[]
}

/** Applies a MicroVM's file changes. Returns false when the token is not the study's MicroVM's. */
export async function applyMicrovmFileSync(sync: MicrovmFileSync, token: string): Promise<boolean> {
    const config = await requireConfig()
    const record = await readRecord(config.workspacesBucket, sync.studyId)
    if (!record) return false
    const expected = Buffer.from(record.syncTokenHash)
    const actual = Buffer.from(sha256(token))
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false

    const store = await studyFileStore()
    for (const file of sync.files) {
        if (!PLAIN_FILE_NAME.test(file.path)) continue
        await store.write(sync.studyId, file.path, Buffer.from(file.content, 'base64'), new Date(file.mtime * 1000))
    }
    for (const name of sync.deleted) {
        if (PLAIN_FILE_NAME.test(name)) await store.remove(sync.studyId, name)
    }
    return true
}
