import { coderUsersPath } from '@/lib/paths'
import { getStudyAndOrgDisplayInfo } from '../db/queries'
import { coderFetch } from './client'
import { getCoderOrganizationId } from './organizations'
import { CoderUser, CoderUserQueryResponse } from './types'
import { shaHash } from '@/server/coder/utils'

export async function getUsername(studyId: string): Promise<string> {
    const info = await getStudyAndOrgDisplayInfo(studyId)
    if (!info.researcherEmail) {
        throw new Error('Error retrieving researcher email!')
    }
    // Coder usernames are limited to 32 characters
    return shaHash(info.researcherEmail).slice(0, 32)
}

export async function getUserEmail(studyId: string): Promise<string> {
    const info = await getStudyAndOrgDisplayInfo(studyId)
    if (!info.researcherEmail) {
        throw new Error('Error retrieving researcher email!')
    }
    return info.researcherEmail
}

async function createCoderUser(studyId: string): Promise<CoderUser> {
    const info = await getStudyAndOrgDisplayInfo(studyId)

    if (!info.researcherEmail) {
        throw new Error('Error retrieving researcher info!')
    }

    const userEmail = await getUserEmail(studyId)

    // Coder usernames are limited to 32 characters
    const generatedUsername = shaHash(userEmail).slice(0, 32)
    const body = {
        email: info.researcherEmail,
        login_type: 'oidc',
        name: info.researcherFullName,
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

export async function getCoderUser(studyId: string): Promise<CoderUser | null> {
    const email = await getUserEmail(studyId)
    const data = await coderFetch<CoderUserQueryResponse>(`${coderUsersPath()}?q=${email}`, {
        errorMessage: 'Failed to query users',
    })

    if (data.users?.length) {
        // User exists, return the user data
        return data.users[0]
    }

    return null
}

export async function getOrCreateCoderUser(studyId: string): Promise<CoderUser> {
    const user = await getCoderUser(studyId)

    if (user) {
        return user
    }

    return await createCoderUser(studyId)
}
