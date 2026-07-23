import { coderUsersPath } from '@/lib/paths'
import { coderFetch } from './client'
import { getCoderOrganizationId } from './organizations'
import { CoderSessionUser, CoderUser, CoderUserQueryResponse } from './types'
import { generateCoderUsername } from '@/server/coder/utils'

async function createCoderUser(sessionUser: CoderSessionUser): Promise<CoderUser> {
    if (!sessionUser.email) {
        throw new Error('Session user email is missing!')
    }

    const generatedUsername = generateCoderUsername(sessionUser.email)
    const body = {
        email: sessionUser.email,
        login_type: 'oidc',
        name: sessionUser.fullName,
        username: generatedUsername,
        user_status: 'active',
        organization_ids: [await getCoderOrganizationId()],
    }

    return coderFetch<CoderUser>(coderUsersPath(), {
        method: 'POST',
        body,
        errorMessage: 'Failed to create user',
    })
}

export async function getCoderUser(sessionUser: CoderSessionUser): Promise<CoderUser | null> {
    if (!sessionUser.email) {
        throw new Error('Session user email is missing!')
    }

    const encodedEmail = encodeURIComponent(sessionUser.email)

    const data = await coderFetch<CoderUserQueryResponse>(`${coderUsersPath()}?q=${encodedEmail}`, {
        errorMessage: 'Failed to query users',
    })

    if (data.users?.length) {
        return data.users[0]
    }

    return null
}

export async function getOrCreateCoderUser(sessionUser: CoderSessionUser): Promise<CoderUser> {
    const user = await getCoderUser(sessionUser)

    if (user) {
        return user
    }

    return await createCoderUser(sessionUser)
}
