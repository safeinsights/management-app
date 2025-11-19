import { coderUserInfoPath, coderUsersPath } from '@/lib/paths'
import { getStudyAndOrgDisplayInfo } from '../db/queries'
import { CoderApiError, coderFetch } from './client'
import { getCoderOrganizationId } from './organizations'
import { CoderUser } from './types'
import { shaHash } from '@/server/coder/utils'

export async function getUsername(studyId: string): Promise<string> {
    const info = await getStudyAndOrgDisplayInfo(studyId)
    if (!info.researcherEmail) {
        throw new Error('Error retrieving researcher email!')
    }
    // Coder usernames are limited to 32 characters
    return shaHash(info.researcherEmail).slice(0, 32)
}

async function createCoderUser(studyId: string): Promise<CoderUser> {
    const info = await getStudyAndOrgDisplayInfo(studyId)

    if (!info.researcherEmail || !info.researcherId) {
        throw new Error('Error retrieving researcher info!')
    }

    const username = await getUsername(studyId)
    const body = {
        email: info.researcherEmail,
        login_type: 'oidc',
        name: info.researcherFullName,
        username: username,
        user_status: 'active',
        organization_ids: [await getCoderOrganizationId()],
    }

    return coderFetch<CoderUser>(coderUsersPath(), {
        method: 'POST',
        body,
        errorMessage: 'Failed to create user',
    })
}

export async function getOrCreateCoderUser(studyId: string): Promise<CoderUser> {
    const username = await getUsername(studyId)

    try {
        return await coderFetch<CoderUser>(coderUserInfoPath(username), {
            errorMessage: 'Failed to get user',
        })
    } catch (error) {
        if (error instanceof CoderApiError && error.status === 400) {
            return await createCoderUser(studyId)
        }
        throw error
    }
}
