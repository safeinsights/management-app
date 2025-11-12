import {
    coderOrgsPath,
    coderTemplateId,
    coderUserInfoPath,
    coderUsersPath,
    coderWorkspaceBuildPath,
    coderWorkspaceCreatePath,
    coderWorkspaceDataPath,
    coderWorkspacePath,
} from '@/lib/paths'
import { createHash } from 'crypto'
import { getConfigValue } from './config'
import { getStudyAndOrgDisplayInfo } from './db/queries'

const CODER_WORKSPACE_NAME_LIMIT = 10

export type CoderBaseEntity = {
    id: string
    name: string
}

export interface CoderWorkspaceEvent {
    latest_build?: {
        resources?: CoderResource[]
        workspace_owner_name?: string
        workspace_name?: string
    }
    url?: string
    message?: string
}

export interface CoderResource {
    agents?: CoderAgent[]
}

export interface CoderAgent {
    lifecycle_state?: string // e.g. "ready", "starting"
    status?: string // e.g. "connected"
    apps?: CoderApp[]
}

export interface CoderApp {
    slug: string // "code-server"
    health?: string // "healthy" | "unhealthy"
}

// Private helper method to generate username from email and userId
export function generateUsername(email: string, userId: string) {
    let username = shaHash(`${email}${userId}`)
    // Truncate to less than 32 characters
    if (username.length >= 32) {
        username = username.substring(0, 31)
    }
    return username
}

export const generateWorkspaceUrl = async (studyId: string) => {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const workspaceName = generateWorkspaceName(studyId)
    const username = await getUsername(studyId)
    return `${coderApiEndpoint}${coderWorkspacePath(username, workspaceName)}`
}

const getUsername = async (studyId: string) => {
    const info = await getStudyAndOrgDisplayInfo(studyId)
    if (!info.researcherEmail || !info.researcherId) throw new Error('Error retrieving researcher info!')
    const username = generateUsername(info.researcherEmail, info.researcherId)
    console.log('USERNAME::::::', username)
    return username
}

const createCoderUser = async (studyId: string) => {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const coderToken = await getConfigValue('CODER_TOKEN')

    const info = await getStudyAndOrgDisplayInfo(studyId)

    if (!info.researcherEmail || !info.researcherId) throw new Error('Error retrieving researcher info!')
    const username = await getUsername(studyId)
    const body = {
        email: info.researcherEmail,
        login_type: 'oidc',
        name: info.researcherFullName,
        username: username,
        user_status: 'active',
        organization_ids: [await getCoderOrganization()],
    }
    console.log('BODY::::::', body)
    const createUserResponse = await fetch(`${coderApiEndpoint}${coderUsersPath()}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Coder-Session-Token': coderToken,
        },
        body: JSON.stringify(body),
    })
    if (!createUserResponse.ok) {
        const errorText = await createUserResponse.text()
        throw new Error(`Failed to create user: ${createUserResponse.status} ${errorText}`)
    }
    return await createUserResponse.json()
}

export const getCoderUser = async (studyId: string) => {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const coderToken = await getConfigValue('CODER_TOKEN')
    const username = await getUsername(studyId)
    // First, try to get the user by name
    const userResponse = await fetch(`${coderApiEndpoint}${coderUserInfoPath(username)}`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'Coder-Session-Token': coderToken,
        },
    })

    if (userResponse.ok) {
        // User exists, get the user data
        return await userResponse.json()
    } else if (userResponse.status === 400) {
        return await createCoderUser(studyId)
    } else {
        // Some other error occurred
        const errorText = await userResponse.text()
        throw new Error(`Failed to get user: ${userResponse.status} ${errorText}`)
    }
}

export const getCoderWorkspaceUrl = async (studyId: string, workspaceId: string): Promise<string | null> => {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const coderToken = await getConfigValue('CODER_TOKEN')

    const response = await fetch(`${coderApiEndpoint}/api/v2/workspaces/${workspaceId}`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'Coder-Session-Token': coderToken,
        },
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to get workspace status: ${response.status} ${errorText}`)
    }
    if (isWorkspaceReady(await response.json())) {
        return await generateWorkspaceUrl(studyId)
    }
    return null
}

export function isWorkspaceReady(event: CoderWorkspaceEvent): boolean {
    if (!event) return false
    const resources = event.latest_build?.resources
    if (!resources || resources.length === 0) return false

    for (const resource of resources) {
        for (const agent of resource.agents ?? []) {
            const lifecycle = (agent.lifecycle_state ?? '').toLowerCase()
            const status = (agent.status ?? '').toLowerCase()

            // Consider agent ready if lifecycle is 'ready' or status is 'ready'/'connected'
            const agentReady = lifecycle === 'ready' || status === 'ready' || status === 'connected'

            // Require a healthy code-server app on the same agent
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

const getCoderWorkspace = async (studyId: string) => {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const coderToken = await getConfigValue('CODER_TOKEN')
    const username = await getUsername(studyId)
    const workspaceName = generateWorkspaceName(studyId)
    const workspaceStatusResponse = await fetch(
        `${coderApiEndpoint}${coderWorkspaceDataPath(username, workspaceName)}`,
        {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'Coder-Session-Token': coderToken,
            },
        },
    )
    if (workspaceStatusResponse.ok) {
        const workspaceData = await workspaceStatusResponse.json()
        // Check if workspace exists and is stopped
        if (workspaceData.latest_build && workspaceData.latest_build.status === 'stopped') {
            console.warn(`Workspace was stopped`)
            // Start the workspace
            const buildResponse = await fetch(`${coderApiEndpoint}${coderWorkspaceBuildPath(workspaceData.id)}`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Coder-Session-Token': coderToken,
                },
                body: JSON.stringify({
                    transition: 'start',
                }),
            })
            if (!buildResponse.ok) {
                const errorText = await buildResponse.text()
                console.warn(`Issue initiating Build for workspace ${workspaceData.id}. Cause: ${errorText}`)
            }
        }
        return workspaceData
    } else {
        // If workspace doesn't exist, create it
        return await createCoderWorkspace(studyId)
    }
}

export const createCoderWorkspace = async (studyId: string) => {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const coderToken = await getConfigValue('CODER_TOKEN')
    const username = await getUsername(studyId)
    const workspaceName = generateWorkspaceName(studyId)
    // Prepare workspace data
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

    // Create workspace using Coder API
    const response = await fetch(
        `${coderApiEndpoint}${coderWorkspaceCreatePath(await getCoderOrganization(), username)}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'Coder-Session-Token': coderToken,
            },
            body: JSON.stringify(data),
        },
    )

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to create workspace: ${response.status} ${errorText}`)
    }
    return await response.json()
}

export const createUserAndWorkspace = async (studyId: string) => {
    try {
        const _user = await getCoderUser(studyId)
        const workspace = await getCoderWorkspace(studyId)
        return {
            success: true,
            workspace: workspace,
        }
    } catch (error) {
        console.error('Error in createUserAndWorkspace:', error)
        throw new Error(
            `Failed to create user and workspace: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
    }
}
export const getCoderOrganization = async () => {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const coderToken = await getConfigValue('CODER_TOKEN')
    const organizationResponse = await fetch(`${coderApiEndpoint}${coderOrgsPath()}`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'Coder-Session-Token': coderToken,
        },
    })
    if (!organizationResponse.ok) {
        throw new Error('Failed to fetch organization data from Coder API')
    }
    const responseJson = await organizationResponse.json()

    // Try to get organizations array - most common cases
    let organizations = responseJson

    // If it's an object with a data property (common API pattern)
    if (typeof responseJson === 'object' && responseJson !== null && 'data' in responseJson) {
        organizations = responseJson.data
    }
    // If it's an object with organizations property
    else if (typeof responseJson === 'object' && responseJson !== null && 'organizations' in responseJson) {
        organizations = responseJson.organizations
    }

    // Ensure we have an array
    if (!Array.isArray(organizations)) {
        // If it's still not an array, try to extract first array value from object
        if (typeof responseJson === 'object' && responseJson !== null) {
            const arrayValues = Object.values(responseJson).filter(Array.isArray)
            if (arrayValues.length > 0) {
                organizations = arrayValues[0]
            } else {
                // Last resort: convert to array if it's a single object
                if (typeof responseJson === 'object' && responseJson !== null) {
                    organizations = [responseJson]
                } else {
                    throw new Error('Failed to extract organizations array from response')
                }
            }
        } else {
            throw new Error('Failed to extract organizations array from response')
        }
    }

    const foundOrg = organizations.find((org: CoderBaseEntity) => org.name === 'coder')
    if (!foundOrg) {
        throw new Error('Coder organization not found')
    }
    return foundOrg.id
}

export const getCoderTemplateId = async () => {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const coderToken = await getConfigValue('CODER_TOKEN')
    const coderTemplate = await getConfigValue('CODER_TEMPLATE')
    const templatesResponse = await fetch(`${coderApiEndpoint}${coderTemplateId()}`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'Coder-Session-Token': coderToken,
        },
    })
    if (!templatesResponse.ok) {
        throw new Error('Failed to fetch templates data from Coder API')
    }
    const responseJson = await templatesResponse.json()
    // Handle different response structures - sometimes it's an object with data field, sometimes direct array
    const templates = Array.isArray(responseJson) ? responseJson : responseJson.data || responseJson
    const foundTemplate = templates.find((template: CoderBaseEntity) => template.name === coderTemplate)
    if (!foundTemplate) {
        throw new Error(`Template with name '${coderTemplate}' not found`)
    }
    return foundTemplate.id
}

export function shaHash(input: string): string {
    return createHash('sha256').update(input).digest('hex')
}

export function generateWorkspaceName(studyId: string) {
    if (!studyId) return ''
    const result = shaHash(studyId.replaceAll(/[^a-z0-9]/gi, '').toLowerCase())
    return result.substring(0, CODER_WORKSPACE_NAME_LIMIT)
}
