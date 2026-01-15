import { coderUsersPath } from '@/lib/paths'
import { getStudyAndOrgDisplayInfo } from '../db/queries'
import { coderFetch } from './client'
import { getCoderOrganizationId } from './organizations'
import { CoderUser, CoderUserQueryResponse } from './types'
import { generateCoderUsername } from '@/server/coder/utils'

async function createCoderUser(studyId: string): Promise<CoderUser> {
    const studyInfo = await getStudyAndOrgDisplayInfo(studyId)

    if (!studyInfo.researcherEmail) {
        throw new Error('Researcher email is missing!')
    }

    // Coder usernames are limited to 30 characters
    const generatedUsername = generateCoderUsername(studyInfo.researcherEmail).slice(0, 30)
    const body = {
        email: studyInfo.researcherEmail,
        login_type: 'oidc',
        name: studyInfo.researcherFullName,
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
    const studyInfo = await getStudyAndOrgDisplayInfo(studyId)

    if (!studyInfo.researcherEmail) {
        throw new Error('Error retrieving researcher info!')
    }

    const encodedEmail = encodeURIComponent(studyInfo.researcherEmail)

    const data = await coderFetch<CoderUserQueryResponse>(`${coderUsersPath()}?q=${encodedEmail}`, {
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
