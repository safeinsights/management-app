import {
    basename,
    coderWorkspaceBuildPath,
    coderWorkspaceCreatePath,
    coderWorkspaceDataPath,
    coderWorkspacePath,
    pathForSampleData,
} from '@/lib/paths'
import logger from '@/lib/logger'
import { getConfigValue } from '../config'
import { CoderApiError, coderFetch } from './client'
import { getCoderOrganizationId, getCoderTemplateId } from './organizations'
import { CoderWorkspace, CoderWorkspaceEvent } from './types'
import { getCoderUser, getOrCreateCoderUser } from './users'
import { generateWorkspaceName } from './utils'
import { fetchLatestCodeEnvForStudyId } from '../db/queries'
import { fetchFileContents } from '../storage'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

async function generateWorkspaceUrl(studyId: string): Promise<string> {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const workspaceName = generateWorkspaceName(studyId)
    const user = await getCoderUser(studyId)
    if (!user) {
        throw new Error('Coder user not found')
    }
    return `${coderApiEndpoint}${coderWorkspacePath(user.username, workspaceName)}`
}

function isWorkspaceReady(event: CoderWorkspaceEvent): boolean {
    if (!event) return false
    const resources = event.latest_build?.resources
    if (!resources || resources.length === 0) return false

    for (const resource of resources) {
        for (const agent of resource.agents ?? []) {
            const lifecycle = (agent.lifecycle_state ?? '').toLowerCase()
            const status = (agent.status ?? '').toLowerCase()

            const agentReady = lifecycle === 'ready' || status === 'ready' || status === 'connected'
            const codeServerHealthy = (agent.apps ?? []).some(
                (app) => app.slug === 'code-server' && (app.health ?? '').toLowerCase() === 'healthy',
            )

            if (agentReady && codeServerHealthy) {
                return true
            }
        }
    }

    return false
}

export async function getCoderWorkspaceUrl(studyId: string, workspaceId: string): Promise<string | null> {
    const workspace = await coderFetch<CoderWorkspaceEvent>(`/api/v2/workspaces/${workspaceId}`, {
        errorMessage: 'Failed to get workspace status',
    })

    if (isWorkspaceReady(workspace)) {
        return await generateWorkspaceUrl(studyId)
    }

    return null
}

async function startWorkspace(workspaceId: string): Promise<void> {
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
            const environment = codeEnv.settings?.environment || []
            environment.push({
                name: 'SAMPLE_DATA_PATH', value: pathForSampleData({
                    orgSlug: codeEnv.slug,
                    codeEnvId: codeEnv.id,
                    sampleDataPath: codeEnv.sampleDataPath,
                })
            })

            return await createCoderWorkspace({
                studyId,
                username: user.username,
                containerImage: codeEnv.url,
                environment,
            })
        }
        throw error
    }
}

interface CreateCoderWorkspaceOptions {
    studyId: string
    username: string
    containerImage: string
    environment?: Array<{ name: string; value: string }>
}

async function createCoderWorkspace(options: CreateCoderWorkspaceOptions): Promise<CoderWorkspace> {
    const { studyId, username, environment = [] } = options
    const workspaceName = generateWorkspaceName(studyId)

    // Populate code files prior to launching workspace
    await initializeWorkspaceCodeFiles(studyId)

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

const initializeWorkspaceCodeFiles = async (studyId: string): Promise<void> => {
    const coderBaseFilePath = await getConfigValue('CODER_FILES')
    const codeEnv = await fetchLatestCodeEnvForStudyId(studyId)

    logger.info(`Initializing workspace with starter code for study ${studyId} ...`)

    const fileData = await fetchFileContents(codeEnv.starterCodePath)
    const fileName = basename(codeEnv.starterCodePath)
    const targetFilePath = path.join(coderBaseFilePath, studyId, fileName)

    logger.info(`Writing ${fileName} to ${targetFilePath} for study ${studyId}`)

    await fs.mkdir(path.dirname(targetFilePath), { recursive: true })
    await fs.writeFile(targetFilePath, Buffer.from(await fileData.arrayBuffer()))
}
