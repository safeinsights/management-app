import {
    coderWorkspaceBuildPath,
    coderWorkspaceCreatePath,
    coderWorkspaceDataPath,
    coderWorkspacePath,
    pathForStudyJobCodeFile,
} from '@/lib/paths'
import logger from '@/lib/logger'
import { getConfigValue } from '../config'
import { CoderApiError, coderFetch } from './client'
import { getCoderOrganizationId, getCoderTemplateId } from './organizations'
import { CoderWorkspace, CoderWorkspaceEvent } from './types'
import { getCoderUser, getOrCreateCoderUser } from './users'
import { generateWorkspaceName } from './utils'
import { jobInfoForJobId, latestJobForStudy } from '../db/queries'
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
            return await createCoderWorkspace(studyId, user.username)
        }
        throw error
    }
}

async function createCoderWorkspace(studyId: string, username: string): Promise<CoderWorkspace> {
    const workspaceName = generateWorkspaceName(studyId)

    // Populate code files prior to launching workspace
    await initializeWorkspaceCodeFiles(studyId)

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
    const latestJob = await latestJobForStudy(studyId)
    const latestJobInfo = await jobInfoForJobId(latestJob.id)

    const mainCodeFile = latestJob.files.filter((file) => file.fileType === 'MAIN-CODE')
    const supplementalCodeFiles = latestJob.files.filter((file) => file.fileType === 'SUPPLEMENTAL-CODE')

    for (const codeFile of mainCodeFile.concat(supplementalCodeFiles)) {
        const fileData = await fetchFileContents(
            pathForStudyJobCodeFile(
                { orgSlug: latestJobInfo.orgSlug, studyId: latestJob.studyId, studyJobId: latestJob.id },
                codeFile.name,
            ),
        )
        const targetFilePath = path.join(coderBaseFilePath, studyId, codeFile.name)

        // Create parent directory if needed and then write file
        await fs.mkdir(path.dirname(targetFilePath), { recursive: true })
        await fs.writeFile(targetFilePath, Buffer.from(await fileData.arrayBuffer()))
    }
}
