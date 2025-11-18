import {
    coderWorkspaceBuildPath,
    coderWorkspaceCreatePath,
    coderWorkspaceDataPath,
    coderWorkspacePath,
} from '@/lib/paths'
import logger from '@/lib/logger'
import { getConfigValue } from '../config'
import { CoderApiError, coderFetch } from './client'
import { getCoderOrganizationId, getCoderTemplateId } from './organizations'
import { CoderWorkspace, CoderWorkspaceEvent } from './types'
import { getOrCreateCoderUser, getUsername } from './users'
import { generateWorkspaceName } from './utils'

export async function generateWorkspaceUrl(studyId: string): Promise<string> {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const workspaceName = generateWorkspaceName(studyId)
    const username = await getUsername(studyId)
    return `${coderApiEndpoint}${coderWorkspacePath(username, workspaceName)}`
}

export function isWorkspaceReady(event: CoderWorkspaceEvent): boolean {
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
    const username = await getUsername(studyId)
    const workspaceName = generateWorkspaceName(studyId)

    try {
        const workspaceData = await coderFetch<CoderWorkspace>(coderWorkspaceDataPath(username, workspaceName), {
            errorMessage: 'Failed to get workspace',
        })

        if (workspaceData.latest_build && workspaceData.latest_build.status === 'stopped') {
            logger.warn(`Workspace was stopped`)
            await startWorkspace(workspaceData.id)
        }

        return workspaceData
    } catch (error) {
        if (error instanceof CoderApiError && (error.status === 404 || error.status === 400)) {
            return await createCoderWorkspace(studyId)
        }
        throw error
    }
}

export async function createCoderWorkspace(studyId: string): Promise<CoderWorkspace> {
    const username = await getUsername(studyId)
    const workspaceName = generateWorkspaceName(studyId)

    const data = {
        name: workspaceName,
        template_id: await getCoderTemplateId(),
        automatic_updates: 'always',
        rich_parameter_values: [
            {
                name: 'Study ID',
                value: studyId,
            },
        ],
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
        await getOrCreateCoderUser(studyId)
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
