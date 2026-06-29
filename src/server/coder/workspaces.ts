import {
    coderWorkspaceAgentLogsPath,
    coderWorkspaceBuildByIdPath,
    coderWorkspaceBuildLogsPath,
    coderWorkspaceBuildPath,
    coderWorkspaceCreatePath,
    coderWorkspaceDataPath,
    coderWorkspacePath,
    pathForSampleData,
    pathForStarterCode,
} from '@/lib/paths'
import logger from '@/lib/logger'
import { completePathForSampleData, s3BucketName, toAthenaDbName, toPgDbName } from '../aws'
import { getConfigValue } from '../config'
import { CoderApiError, coderFetch } from './client'
import { getCoderOrganizationId, getCoderTemplateId } from './organizations'
import type {
    AgentId,
    WorkspaceStatus,
    CoderLog,
    CoderUsername,
    CoderWorkspace,
    CoderWorkspaceBuild,
    CoderWorkspaceEvent,
    WorkspaceId,
    WorkspaceLaunchStatus,
    JobStatus,
} from './types'
import { getCoderUser, getOrCreateCoderUser } from './users'
import { generateWorkspaceName } from './utils'
import { fetchLatestCodeEnvForStudyId } from '../db/queries'
import { latestStudyJobCreatedAt } from '../db/mutations'
import { db } from '@/database'
import { fetchFileContents } from '../storage'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { errorToString, isActionError } from '@/lib/errors'
import { ContextName, getAgentContext } from '@/lib/agent-context'
import * as database from '@/database'
import { generateDataSourcesContextString } from '@/server/utils'

async function generateWorkspaceUrl(studyId: string): Promise<string> {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const workspaceName = generateWorkspaceName(studyId)
    const user = await getCoderUser(studyId)
    if (!user) {
        logger.error(`[coder-launch study=${studyId}] Coder user not found for workspace ${workspaceName}`)
        throw new Error('Coder user not found')
    }
    return `${coderApiEndpoint}${coderWorkspacePath(user.username, workspaceName)}`
}

// Returns readiness plus a short human-readable reason. The reason is logged
// while polling so a workspace that never becomes ready leaves a trail of
// exactly which gate (build status, agent lifecycle, code-server health) is
// holding it up, instead of an opaque stream of nulls.
function describeReadiness(event: CoderWorkspaceEvent): { ready: boolean; reason: string } {
    if (!event) return { ready: false, reason: 'no workspace event' }

    const buildStatus = event.latest_build?.status ?? 'unknown'
    const resources = event.latest_build?.resources
    if (!resources || resources.length === 0) {
        return { ready: false, reason: `build status=${buildStatus}, no resources yet` }
    }

    const agentStates: string[] = []
    for (const resource of resources) {
        for (const agent of resource.agents ?? []) {
            const lifecycle = agent.lifecycle_state
            const status = agent.status

            const agentReady = lifecycle === 'ready' || status === 'connected'
            const codeServer = (agent.apps ?? []).find((app) => app.slug === 'code-server')
            const codeServerHealth = codeServer?.health
            const codeServerHealthy = codeServerHealth === 'healthy'

            if (agentReady && codeServerHealthy) {
                return { ready: true, reason: `agent lifecycle=${lifecycle} status=${status}, code-server=healthy` }
            }
            agentStates.push(`{lifecycle=${lifecycle || '∅'} status=${status || '∅'} code-server=${codeServerHealth}}`)
        }
    }

    return { ready: false, reason: `build status=${buildStatus}, agents not ready: ${agentStates.join(', ')}` }
}

// Once the workspace reports ready, copy starter code/context in and produce the IDE url.
async function finalizeWorkspaceLaunch(studyId: string): Promise<string> {
    await initializeWorkspaceCodeFiles(studyId)
    return generateWorkspaceUrl(studyId)
}

// Fetch logs from an already-built path; returns the new lines (empty on any failure so a
// missing log stream never aborts the overall status read).
async function fetchLogs(path: string): Promise<CoderLog[]> {
    try {
        return await coderFetch<CoderLog[]>(path, { errorMessage: 'Failed to fetch logs' })
    } catch (error) {
        logger.warn(`Failed fetching coder logs from ${path}:`, error)
        return []
    }
}

function maxLogId(logs: CoderLog[], current: number | null): number | null {
    return logs.reduce((max, log) => (max == null || log.id > max ? log.id : max), current)
}

// Polls the workspace's latest build (workspacebuilds) and its agents (workspaceagents),
// returning the build status plus the timestamp of the most recent log line so the client
// can show real progress. Resolves the IDE url once the workspace is ready.
export async function getCoderWorkspaceLaunchStatus(
    studyId: string,
    cursors?: WorkspaceLaunchStatus['cursors'],
): Promise<WorkspaceLaunchStatus> {
    const logCtx = `[coder-status study=${studyId}]`

    const user = await getCoderUser(studyId)
    if (!user) throw new Error('Coder user not found')
    const workspaceName = generateWorkspaceName(studyId)

    const workspace = await coderFetch<CoderWorkspaceEvent>(coderWorkspaceDataPath(user.username, workspaceName), {
        errorMessage: 'Failed to get workspace status',
    })

    const buildId = workspace.latest_build?.id
    const agentIds = (workspace.latest_build?.resources ?? []).flatMap((r) =>
        (r.agents ?? []).map((a) => a.id).filter((id): id is AgentId => Boolean(id)),
    )

    let build: CoderWorkspaceBuild | undefined
    if (buildId) {
        try {
            build = await coderFetch<CoderWorkspaceBuild>(coderWorkspaceBuildByIdPath(buildId), {
                errorMessage: 'Failed to get build',
            })
        } catch (error) {
            logger.warn(`${logCtx} failed fetching build ${buildId}:`, error)
        }
    }

    const newCursors: WorkspaceLaunchStatus['cursors'] = {
        build: cursors?.build ?? null,
        agents: { ...(cursors?.agents ?? {}) },
    }
    let lastLogAt: string | null = null
    const trackLastLog = (logs: CoderLog[]) => {
        for (const log of logs) {
            if (!lastLogAt || log.created_at > lastLogAt) lastLogAt = log.created_at
        }
    }

    if (buildId) {
        const buildLogs = await fetchLogs(coderWorkspaceBuildLogsPath(buildId, newCursors.build))
        trackLastLog(buildLogs)
        newCursors.build = maxLogId(buildLogs, newCursors.build)
    }
    for (const agentId of agentIds) {
        const agentLogs = await fetchLogs(coderWorkspaceAgentLogsPath(agentId, newCursors.agents[agentId] ?? null))
        trackLastLog(agentLogs)
        newCursors.agents[agentId] = maxLogId(agentLogs, newCursors.agents[agentId] ?? null)
    }

    const readiness = describeReadiness(workspace)
    const buildStatus: WorkspaceStatus = build?.status ?? workspace.latest_build?.status ?? 'unknown'
    const jobStatus: JobStatus = build?.job?.status ?? 'unknown'
    const failedWorkspaceStatuses: WorkspaceStatus[] = ['failed', 'canceled']
    const failedJobStatuses: JobStatus[] = ['failed']
    const failed =
        failedWorkspaceStatuses.includes(buildStatus) || (jobStatus != null && failedJobStatuses.includes(jobStatus))

    const reason = failed ? (build?.job?.error ?? readiness.reason) : readiness.reason
    logger.info(`${logCtx} buildStatus=${buildStatus}: ${reason}`)

    const url = readiness.ready ? await finalizeWorkspaceLaunch(studyId) : null

    return { buildStatus, ready: readiness.ready, failed, reason, lastLogAt, cursors: newCursors, url }
}

async function startWorkspace(workspaceId: WorkspaceId): Promise<void> {
    try {
        await coderFetch<unknown>(coderWorkspaceBuildPath(workspaceId), {
            method: 'POST',
            body: { transition: 'start' },
            errorMessage: 'Failed to start workspace',
        })
    } catch (error) {
        logger.warn(`Issue initiating Build for workspace ${workspaceId}:`, error)
    }
}

async function buildWorkspaceEnvironment(codeEnv: Awaited<ReturnType<typeof fetchLatestCodeEnvForStudyId>>) {
    const environment = [...(codeEnv.settings?.environment || [])]
    const dataPath = completePathForSampleData({
        orgSlug: codeEnv.slug,
        codeEnvId: codeEnv.id,
        sampleDataPath: codeEnv.sampleDataPath ?? undefined,
    })
    const prefix = codeEnv.identifier.toUpperCase().replace(/-/g, '_')

    environment.push({ name: 'DATA_PATH', value: dataPath })
    environment.push({ name: `${prefix}_DATA_PATH`, value: dataPath })

    const bucketName = s3BucketName()
    const bucketPrefix = pathForSampleData({
        orgSlug: codeEnv.slug,
        codeEnvId: codeEnv.id,
        sampleDataPath: codeEnv.sampleDataPath ?? undefined,
    })
    const bucketRegion = process.env.AWS_REGION || 'us-east-1'
    environment.push({ name: `${prefix}_S3_BUCKET_NAME`, value: bucketName })
    environment.push({ name: `${prefix}_S3_BUCKET_PREFIX`, value: bucketPrefix })
    environment.push({ name: `${prefix}_S3_BUCKET_REGION`, value: bucketRegion })

    if (codeEnv.dataSourceType === 'athena') {
        const dbName = toAthenaDbName(codeEnv.slug, codeEnv.identifier)
        const resultsBucket = await getConfigValue('ATHENA_RESULTS_BUCKET_NAME', false)
        const athenaOutputPath = resultsBucket ? `s3://${resultsBucket}/query-results/` : dataPath
        const dbUrl = `athena://athena.${bucketRegion}.amazonaws.com:443/${dbName}?s3_location=${athenaOutputPath}`
        environment.push({ name: 'DATABASE_URL', value: dbUrl })
        environment.push({ name: `${prefix}_DATABASE_URL`, value: dbUrl })
        environment.push({ name: 'AWS_ATHENA_S3_STAGING_DIR', value: athenaOutputPath })
        environment.push({ name: 'AWS_ATHENA_WORK_GROUP', value: await getConfigValue('CODER_ATHENA_WORK_GROUP') })
        environment.push({ name: 'AWS_ATHENA_DATABASE_NAME', value: dbName })
        environment.push({ name: 'AWS_REGION', value: bucketRegion })
    } else if (codeEnv.dataSourceType === 'postgres') {
        const dbName = toPgDbName(codeEnv.slug, codeEnv.identifier)
        const pgHost = await getConfigValue('CODER_SAMPLE_DATA_POSTGRES_HOST')
        const pgUser = await getConfigValue('CODER_SAMPLE_DATA_READ_ONLY_POSTGRES_USER')
        const dbUrl = `postgres://${pgUser}@${pgHost}/${dbName}`
        environment.push({ name: 'DATABASE_URL', value: dbUrl })
        environment.push({ name: `${prefix}_DATABASE_URL`, value: dbUrl })
    }

    return environment
}

async function getOrCreateCoderWorkspace(studyId: string): Promise<CoderWorkspace> {
    const user = await getOrCreateCoderUser(studyId)
    const workspaceName = generateWorkspaceName(studyId)

    const codeEnv = await fetchLatestCodeEnvForStudyId(studyId)

    try {
        const workspaceData = await coderFetch<CoderWorkspace>(coderWorkspaceDataPath(user.username, workspaceName), {
            errorMessage: 'Failed to get workspace',
        })

        if (workspaceData.latest_build && workspaceData.latest_build.status === 'stopped') {
            logger.warn(`Workspace was stopped`)
            await startWorkspace(workspaceData.id)
        }

        return workspaceData
    } catch (error) {
        if (error instanceof CoderApiError && (error.status === 404 || error.status === 400)) {
            return await createCoderWorkspace({
                studyId,
                username: user.username,
                containerImage: codeEnv.url,
                environment: await buildWorkspaceEnvironment(codeEnv),
            })
        }
        throw error
    }
}

interface CreateCoderWorkspaceOptions {
    studyId: string
    username: CoderUsername
    containerImage: string
    environment?: Array<{ name: string; value: string }>
}

async function createCoderWorkspace(options: CreateCoderWorkspaceOptions): Promise<CoderWorkspace> {
    const { studyId, username, environment = [] } = options
    const workspaceName = generateWorkspaceName(studyId)

    const richParameterValues: Array<{ name: string; value: string }> = [
        {
            name: 'study_id',
            value: options.studyId,
        },
        {
            name: 'container_image',
            value: options.containerImage,
        },
        {
            name: 'environment',
            value: JSON.stringify(environment),
        },
    ]

    const data = {
        name: workspaceName,
        template_id: await getCoderTemplateId(),
        automatic_updates: 'always',
        rich_parameter_values: richParameterValues,
    }

    return coderFetch<CoderWorkspace>(coderWorkspaceCreatePath(await getCoderOrganizationId(), username), {
        method: 'POST',
        body: data,
        errorMessage: 'Failed to create workspace',
    })
}

export async function createUserAndWorkspace(
    studyId: string,
): Promise<{ success: boolean; workspace: CoderWorkspace }> {
    try {
        const workspace = await getOrCreateCoderWorkspace(studyId)
        return {
            success: true,
            workspace: workspace,
        }
    } catch (error) {
        logger.error('Error in createUserAndWorkspace:', error)
        throw new Error(
            `Failed to create user and workspace: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
    }
}

async function studyDirHasFiles(dir: string): Promise<boolean> {
    try {
        const entries = await fs.readdir(dir)
        return entries.some((e) => !e.startsWith('.'))
    } catch (e) {
        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return false
        throw e
    }
}

const initializeWorkspaceCodeFiles = async (studyId: string): Promise<void> => {
    const logCtx = `[coder-init study=${studyId}]`
    const coderBaseFilePath = await getConfigValue('CODER_FILES')
    const studyDir = path.join(coderBaseFilePath, studyId)

    // Idempotent: only copy starter files when the directory is empty.
    // Skips repeat calls (ready-polling) and avoids clobbering user edits across sessions.
    if (await studyDirHasFiles(studyDir)) {
        logger.info(`${logCtx} ${studyDir} already has files, skipping starter-code copy`)
        return
    }

    const codeEnv = await fetchLatestCodeEnvForStudyId(studyId)
    const starterFiles = codeEnv.starterCodeFileNames ?? []
    logger.info(
        `${logCtx} initializing into ${studyDir} from codeEnv=${codeEnv.identifier} (id=${codeEnv.id}), ` +
            `${starterFiles.length} starter file(s): [${starterFiles.join(', ')}]`,
    )

    // Backdate starter-file mtime relative to the baseline studyJob rather than wall-clock.
    // Wall-clock backdating breaks when Coder provisioning takes longer than the backdate window:
    // files end up newer than the baseline and the "files changed" gate flips Submit on without
    // any user edits. Falling back to wall-clock is only for the (currently impossible) case of
    // no baseline existing.
    const baselineCreatedAt = await latestStudyJobCreatedAt(db, studyId)
    const pastDate = baselineCreatedAt ? new Date(baselineCreatedAt.getTime() - 1000) : new Date(Date.now() - 60_000)

    for (const fileName of starterFiles) {
        const filePath = pathForStarterCode({ orgSlug: codeEnv.slug, codeEnvId: codeEnv.id, fileName })
        const targetFilePath = path.join(studyDir, fileName)

        let fileData
        try {
            fileData = await fetchFileContents(filePath)
        } catch (error) {
            logger.error(`${logCtx} failed fetching starter file from s3://${filePath}:`, error)
            throw error
        }

        try {
            await fs.mkdir(path.dirname(targetFilePath), { recursive: true })
            await fs.writeFile(targetFilePath, Buffer.from(await fileData.arrayBuffer()))
            await fs.utimes(targetFilePath, pastDate, pastDate)
        } catch (error) {
            logger.error(`${logCtx} failed writing starter file to ${targetFilePath}:`, error)
            throw error
        }
        logger.info(`${logCtx} wrote ${fileName} to ${targetFilePath}`)
    }

    // Initialize claude.md
    // FYI: claude.md is only populated on workspace init. New updates to context after
    // a workspace has been launched will not propagate.
    const workspaceContexts: ContextName[] = ['SYSTEM', codeEnv.language]

    let combinedContextString = ''
    for (const contextName of workspaceContexts) {
        let response
        try {
            response = await getAgentContext(database.db, { name: contextName, orgId: null })
        } catch (error) {
            logger.error(`${logCtx} failed fetching agent context "${contextName}":`, error)
            throw error
        }
        if (isActionError(response)) {
            logger.error(`${logCtx} agent context "${contextName}" returned error: ${errorToString(response)}`)
            throw new Error(errorToString(response))
        }
        if (response.content) combinedContextString += response.content + '\n'
    }

    combinedContextString += await generateDataSourcesContextString(codeEnv.orgId)

    const targetContextFileName = 'CLAUDE.md'
    const targetContextPath = path.join(coderBaseFilePath, studyId, targetContextFileName)

    try {
        await fs.mkdir(path.dirname(targetContextPath), { recursive: true })
        await fs.writeFile(targetContextPath, combinedContextString, 'utf-8')
        await fs.utimes(targetContextPath, pastDate, pastDate)
    } catch (error) {
        logger.error(`${logCtx} failed writing ${targetContextFileName} to ${targetContextPath}:`, error)
        throw error
    }
    logger.info(`${logCtx} wrote ${targetContextFileName} (${combinedContextString.length} bytes), init complete`)
}
