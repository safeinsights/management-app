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
import { uuidToStr } from '@/lib/utils'
import { getConfigValue } from './config'
import { getStudyAndOrgDisplayInfo, siUser } from './db/queries'

const CODER_WORKSPACE_NAME_LIMIT = 10

export type CoderBaseEntity = {
    id: string
    name: string
}

// Private helper method to generate username from email and userId
export function generateUsername(email: string, userId: string) {
    // Extract the part before @ in email
    const emailUsername = email.split('@')[0] || ''

    // Remove all non-alphanumeric characters and convert to lowercase
    let username = emailUsername.replaceAll(/[^a-z0-9]/gi, '').toLowerCase()

    // If username is empty or too short, use userId
    if (username.length === 0) {
        username = userId.replaceAll(/[^a-z0-9]/gi, '').toLowerCase()
    }

    // Truncate to less than 32 characters
    if (username.length >= 32) {
        username = username.substring(0, 31)
    }

    return username
}

export const generateWorkspaceUrl = async (username: string, studyId: string) => {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const workspaceName = uuidToStr(studyId, CODER_WORKSPACE_NAME_LIMIT)
    return `${coderApiEndpoint}${coderWorkspacePath(username, workspaceName)}`
}

const getUsername = async (studyId: string) => {
    const info = await getStudyAndOrgDisplayInfo(studyId)
    if (!info.researcherEmail || !info.researcherId) throw new Error('Error retrieving researcher info!')
    return generateUsername(info.researcherEmail, info.researcherId)
}

const createCoderUser = async () => {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const coderToken = await getConfigValue('CODER_TOKEN')

    const user = await siUser()
    const email = user.primaryEmailAddress?.emailAddress

    if (!email) throw new Error('User does not have an email address!')
    const username = generateUsername(email, user.id)
    const createUserResponse = await fetch(`${coderApiEndpoint}${coderUsersPath()}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Coder-Session-Token': coderToken,
        },
        body: JSON.stringify({
            email: email,
            login_type: 'oidc',
            name: user.fullName,
            username: username,
            user_status: 'active',
            organization_ids: [await getCoderOrganization()],
        }),
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
        return await createCoderUser()
    } else {
        // Some other error occurred
        const errorText = await userResponse.text()
        throw new Error(`Failed to get user: ${userResponse.status} ${errorText}`)
    }
}

const getCoderWorkspace = async (studyId: string) => {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const coderToken = await getConfigValue('CODER_TOKEN')
    const username = await getUsername(studyId)
    const workspaceName = uuidToStr(studyId, CODER_WORKSPACE_NAME_LIMIT)
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
        if (workspaceData.latest_build.status === 'stopped') {
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
        await createCoderWorkspace(studyId)
    }
}

const createCoderWorkspace = async (studyId: string) => {
    const coderApiEndpoint = await getConfigValue('CODER_API_ENDPOINT')
    const coderToken = await getConfigValue('CODER_TOKEN')
    const username = await getUsername(studyId)
    const workspaceName = uuidToStr(studyId, CODER_WORKSPACE_NAME_LIMIT)
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
const getCoderOrganization = async () => {
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
    const organizations = await organizationResponse.json()
    return organizations.filter((org: CoderBaseEntity) => org.name === 'coder')?.[0].id
}

const getCoderTemplateId = async () => {
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
    const templates = await templatesResponse.json()
    return templates.filter((template: CoderBaseEntity) => template.name === coderTemplate)?.[0].id
}
