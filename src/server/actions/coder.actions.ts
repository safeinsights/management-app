'use server'

import { Action, z } from './action'

// Private helper method to generate username from email and userId
function generateUsername(email: string, userId: string) {
    // Extract the part before @ in email
    const emailUsername = email.split('@')[0] || ''

    // Remove all non-alphanumeric characters and convert to lowercase
    let username = emailUsername.replace(/[^a-z0-9]/gi, '').toLowerCase()

    // If username is empty or too short, use userId
    if (username.length === 0) {
        username = userId.replace(/[^a-z0-9]/gi, '').toLowerCase()
    }

    // Truncate to less than 10 characters
    if (username.length >= 32) {
        username = username.substring(0, 31)
    }

    return username
}

function generateWorkspaceName(studyId: string) {
    return studyId
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase()
        .substring(0.31)
}

export const getStudyWorkspaceUrl = new Action('getStudyWorkspaceUrl', { performsMutations: false })
    .params(
        z.object({
            userId: z.string().nonempty().trim(),
            studyId: z.string().nonempty().trim(),
            email: z.string().nonempty().email('Invalid email address'),
        }),
    )
    .handler(async ({ params: { userId, email, studyId } }) => {
        const CODER_API_ENDPOINT = process.env.CODER_API_ENDPOINT
        if (!CODER_API_ENDPOINT) {
            throw new Error('CODER_API_ENDPOINT environment variable is not set')
        }
        const workspaceName = generateWorkspaceName(studyId)
        const userName = generateUsername(email, userId)
        return {
            url: `${CODER_API_ENDPOINT}/@${userName}/${workspaceName}.main/apps/code-server`,
        }
    })

export const checkWorkspaceExists = new Action('checkWorkspaceExists', { performsMutations: false })
    .params(
        z.object({
            email: z.string().nonempty().email('Invalid email address'),
            userId: z.string().nonempty().trim(),
            studyId: z.string().nonempty().trim(),
        }),
    )
    .handler(async ({ params: { userId, email, studyId } }) => {
        // Load environment variables
        const CODER_API_ENDPOINT = process.env.CODER_API_ENDPOINT
        const CODER_TOKEN = process.env.CODER_TOKEN

        if (!CODER_API_ENDPOINT) {
            throw new Error('CODER_API_ENDPOINT environment variable is not set')
        }
        if (!CODER_TOKEN) {
            throw new Error('CODER_TOKEN environment variable is not set')
        }
        const workspaceName = generateWorkspaceName(studyId)
        const username = generateUsername(email, userId)

        console.warn(`Checking workspace ${workspaceName} for user ${username}`)
        try {
            // Check if workspace exists using the API endpoint
            // GET /users/{user}/workspace/{workspacename}
            const response = await fetch(`${CODER_API_ENDPOINT}/api/v2/users/${username}/workspace/${workspaceName}`, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'Coder-Session-Token': CODER_TOKEN,
                },
            })

            // Return true if workspace exists (200 OK), false if not found (404)
            return {
                exists: response.ok,
            }
        } catch (error) {
            console.error('Error checking workspace existence:', error)
            // If there's an error (other than 404), we'll consider it as workspace not existing
            return { exists: false }
        }
    })

export const createUserAndWorkspace = new Action('createUserAndWorkspace', { performsMutations: true })
    .params(
        z.object({
            name: z.string().nonempty().trim(),
            userId: z.string().nonempty().trim(),
            email: z.string().nonempty().email('Invalid email address'),
            studyId: z.string().nonempty().trim(),
        }),
    )
    .handler(async ({ params: { name, userId, email, studyId } }) => {
        // Load environment variables
        const CODER_API_ENDPOINT = process.env.CODER_API_ENDPOINT
        const CODER_TOKEN = process.env.CODER_TOKEN
        const CODER_TEMPLATE_ID = process.env.CODER_TEMPLATE_ID
        const CODER_ORGANIZATION = process.env.CODER_ORGANIZATION
        const username = generateUsername(email, userId)

        if (!CODER_API_ENDPOINT) {
            throw new Error('CODER_API_ENDPOINT environment variable is not set')
        }
        if (!CODER_TOKEN) {
            throw new Error('CODER_TOKEN environment variable is not set')
        }
        if (!CODER_TEMPLATE_ID) {
            throw new Error('CODER_TEMPLATE_ID environment variable is not set')
        }
        if (!CODER_ORGANIZATION) {
            throw new Error('CODER_ORGANIZATION environment variable is not set')
        }

        let userData

        try {
            // First, try to get the user by name
            const userResponse = await fetch(`${CODER_API_ENDPOINT}/api/v2/users/${username}`, {
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
                const createUserResponse = await fetch(`${CODER_API_ENDPOINT}/api/v2/users`, {
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

            // Prepare workspace name
            const data = {
                name: generateWorkspaceName(studyId),
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
                `${CODER_API_ENDPOINT}/api/v2/organizations/${CODER_ORGANIZATION}/members/${username}/workspaces`,
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
                workspaceName: generateWorkspaceName(studyId),
            }
        } catch (error) {
            console.error('Error in createUserAndWorkspace:', error)
            throw new Error(
                `Failed to create user and workspace: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    })
