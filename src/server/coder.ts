import {
    coderUserInfoPath,
    coderUsersPath,
    coderWorkspaceBuildPath,
    coderWorkspaceCreatePath,
    coderWorkspaceDataPath,
    coderWorkspacePath,
} from '@/lib/paths'
import { uuidToStr } from '@/lib/utils'
import { currentUser } from '@clerk/nextjs/server'
import { getConfigValue } from './config'

const CODER_WORKSPACE_NAME_LIMIT = 10

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

export const generateWorkspaceUrl = async (studyId: string, userName: string) => {
    const CODER_API_ENDPOINT = await getConfigValue('CODER_API_ENDPOINT')
    const workspaceName = uuidToStr(studyId, CODER_WORKSPACE_NAME_LIMIT)
    return `${CODER_API_ENDPOINT}${coderWorkspacePath(userName, workspaceName)}`
}

export const createUserAndWorkspace = async (name: string, studyId: string, userId: string) => {
    const clerkUser = await currentUser()

    if (!clerkUser) throw new Error('User not authenticated')
    const email = clerkUser.primaryEmailAddress?.emailAddress
    if (!email) throw new Error('User does not have an email address!')
    const username = generateUsername(email, userId)
    const CODER_API_ENDPOINT = await getConfigValue('CODER_API_ENDPOINT')
    const CODER_TOKEN = await getConfigValue('CODER_TOKEN')
    const CODER_ORGANIZATION = await getConfigValue('CODER_ORGANIZATION')
    const CODER_TEMPLATE_ID = await getConfigValue('CODER_TEMPLATE_ID')
    const workspaceName = uuidToStr(studyId, CODER_WORKSPACE_NAME_LIMIT)
    let userData

    try {
        // First, try to get the user by name
        const userResponse = await fetch(`${CODER_API_ENDPOINT}${coderUserInfoPath(username)}`, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'Coder-Session-Token': CODER_TOKEN,
            },
        })

        if (userResponse.ok) {
            // User exists, get the user data
            userData = await userResponse.json()
        } else if (userResponse.status === 400) {
            // User doesn't exist, create a new one
            console.warn(`URL: `)
            const createUserResponse = await fetch(`${CODER_API_ENDPOINT}${coderUsersPath()}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'Coder-Session-Token': CODER_TOKEN,
                },
                body: JSON.stringify({
                    email: email,
                    login_type: 'oidc',
                    name: name,
                    username: username,
                    user_status: 'active',
                    organization_ids: [CODER_ORGANIZATION],
                }),
            })

            if (!createUserResponse.ok) {
                const errorText = await createUserResponse.text()
                throw new Error(`Failed to create user: ${createUserResponse.status} ${errorText}`)
            }

            userData = await createUserResponse.json()
        } else {
            // Some other error occurred
            const errorText = await userResponse.text()
            throw new Error(`Failed to get user: ${userResponse.status} ${errorText}`)
        }

        const workspaceStatusResponse = await fetch(
            `${CODER_API_ENDPOINT}${coderWorkspaceDataPath(username, workspaceName)}`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'Coder-Session-Token': CODER_TOKEN,
                },
            },
        )
        if (!workspaceStatusResponse.ok) {
            const errorText = `There was an issue retrieving the workspace! Cause: ${workspaceStatusResponse.text}`
            console.warn(errorText)

            // Prepare workspace name
            const data = {
                name: workspaceName,
                template_id: CODER_TEMPLATE_ID,
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
                `${CODER_API_ENDPOINT}${coderWorkspaceCreatePath(CODER_ORGANIZATION, username)}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'Coder-Session-Token': CODER_TOKEN,
                    },
                    body: JSON.stringify(data),
                },
            )

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Failed to create workspace: ${response.status} ${errorText}`)
            }

            const workspaceData = await response.json()
            console.warn(JSON.stringify(workspaceData))
            return {
                success: true,
                user: userData,
                workspace: workspaceData,
                workspaceName: workspaceName,
            }
        } else {
            const data = await workspaceStatusResponse.json()
            console.warn(`DATA WS:::  ${JSON.stringify(data)}`)
            if (data.latest_build.status === 'stopped') {
                console.warn(`Workspace was stopped`)
                // Start the workspace
                const buildResponse = await fetch(`${CODER_API_ENDPOINT}${coderWorkspaceBuildPath(data.id)}`, {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Coder-Session-Token': CODER_TOKEN,
                    },
                    body: JSON.stringify({
                        transition: 'start',
                    }),
                })
                if (!buildResponse.ok) {
                    const errorText = await buildResponse.text()
                    console.warn(`Issue initiating Build for workspace ${data.id}. Cause: ${errorText}`)
                }
            }
            return {
                success: true,
                workspaceName: workspaceName,
                workspace: data,
            }
        }
    } catch (error) {
        console.error('Error in createUserAndWorkspace:', error)
        throw new Error(
            `Failed to create user and workspace: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
    }
}
