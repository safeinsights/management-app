import { db, jsonArrayFrom } from '@/database'
import { currentUser as currentClerkUser, type User as ClerkUser } from '@clerk/nextjs/server'
import { ActionReturnType, CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { AccessDeniedError, throwNotFound } from '@/lib/errors'
import { wasCalledFromAPI } from '../api-context'
import { findOrCreateSiUserId } from './mutations'
import { FileType } from '@/database/types'
import { Selectable } from 'kysely'
import { Action } from '../actions/action'

export type SiUser = ClerkUser & {
    id: string
}

export async function siUser(throwIfNotFound?: true): Promise<SiUser>
export async function siUser(throwIfNotFound?: false): Promise<SiUser | null>
export async function siUser(throwIfNotFound = true): Promise<SiUser | null> {
    const clerkUser = wasCalledFromAPI() ? null : await currentClerkUser()
    if (!clerkUser || clerkUser.banned) {
        if (throwIfNotFound) throw new AccessDeniedError({ user: 'was not found' })
        return null
    }

    const userId = await findOrCreateSiUserId(clerkUser.id, clerkUser)
    return {
        ...clerkUser,
        id: userId,
    } as SiUser
}

export async function getStudyJobInfo(studyJobId: string) {
    return await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('org', 'study.orgId', 'org.id')

        .select((eb) => [
            'studyJob.id as studyJobId',
            'studyJob.studyId',
            'studyJob.createdAt',
            'study.title as studyTitle',
            'org.id as orgId',
            'org.slug as orgSlug',
            jsonArrayFrom(
                eb
                    .selectFrom('jobStatusChange')
                    .select(['status', 'createdAt'])
                    .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                    .orderBy('createdAt', 'desc'),
            ).as('statusChanges'),
            jsonArrayFrom(
                eb
                    .selectFrom('studyJobFile')
                    .select(['id', 'name', 'fileType', 'path'])
                    .whereRef('studyJobFile.studyJobId', '=', 'studyJob.id'),
            ).as('files'),
        ])
        .where('studyJob.id', '=', studyJobId)
        .executeTakeFirstOrThrow(throwNotFound(`job for study job id ${studyJobId}`))
}

export const getReviewerPublicKey = async (userId: string) => {
    const result = await db
        .selectFrom('userPublicKey')
        .select(['userPublicKey.fingerprint', 'userPublicKey.publicKey'])
        .where('userPublicKey.userId', '=', userId)
        .executeTakeFirst()

    return result
}

export const getReviewerPublicKeyByUserId = async (userId: string) => {
    const result = await db
        .selectFrom('userPublicKey')
        .select(['userPublicKey.publicKey'])
        .where('userPublicKey.userId', '=', userId)
        .executeTakeFirst()

    return result?.publicKey
}

export type LatestJobForStudy = ActionReturnType<typeof latestJobForStudy>
export const latestJobForStudy = async (studyId: string) => {
    return await Action.db
        .selectFrom('studyJob')
        .selectAll('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .select(['study.orgId'])
        .select((eb) => [
            jsonArrayFrom(
                eb
                    .selectFrom('jobStatusChange')
                    .select(['jobStatusChange.status', 'jobStatusChange.createdAt'])
                    .orderBy('createdAt', 'desc')
                    .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id'),
            ).as('statusChanges'),
            jsonArrayFrom(
                eb
                    .selectFrom('studyJobFile')
                    .select(['name', 'fileType', 'createdAt'])
                    .whereRef('studyJobFile.studyJobId', '=', 'studyJob.id'),
            ).as('files'),
        ])
        .where('studyJob.studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirstOrThrow(throwNotFound(`job for study ${studyId}`))
}

export const allJobsForStudy = async (studyId: string, conn: DBExecutor = db) => {
    return await conn
        .selectFrom('studyJob')
        .selectAll('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .select(['study.orgId'])
        .select((eb) => [
            jsonArrayFrom(
                eb
                    .selectFrom('jobStatusChange')
                    .select(['jobStatusChange.status', 'jobStatusChange.createdAt'])
                    .orderBy('createdAt', 'desc')
                    .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id'),
            ).as('statusChanges'),
            jsonArrayFrom(
                eb
                    .selectFrom('studyJobFile')
                    .select(['name', 'fileType', 'createdAt'])
                    .whereRef('studyJobFile.studyJobId', '=', 'studyJob.id'),
            ).as('files'),
        ])
        .where('studyJob.studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .execute()
}

export const jobInfoForJobId = async (jobId: string) => {
    return await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select(['studyId', 'studyJob.id as studyJobId', 'org.slug as orgSlug', 'org.id as orgId'])
        .where('studyJob.id', '=', jobId)
        .executeTakeFirstOrThrow()
}

export const studyInfoForStudyId = async (studyId: string) => {
    return await db
        .selectFrom('study')
        .innerJoin('org', 'study.orgId', 'org.id')
        .select(['study.id as studyId', 'org.id as orgId', 'org.slug as orgSlug'])
        .where('study.id', '=', studyId)
        .executeTakeFirst()
}

export const getUsersByRoleAndOrgId = async (role: 'researcher' | 'reviewer', orgId: string) => {
    const query = db
        .selectFrom('user')
        .innerJoin('orgUser', 'user.id', 'orgUser.userId')
        .innerJoin('org', 'orgUser.orgId', 'org.id')
        .distinctOn('user.id')
        .select(['user.id', 'user.email', 'user.fullName'])
        .where((eb) => {
            const filters = []
            filters.push(eb('orgUser.orgId', '=', orgId))

            if (role === 'researcher') {
                filters.push(eb('orgUser.isResearcher', '=', true))
            }

            if (role === 'reviewer') {
                filters.push(eb('orgUser.isReviewer', '=', true))
            }

            return eb.and(filters)
        })

    return await query.execute()
}

// this is called primarlily by the mail functions to get study infoormation
// some of these functions are called by API which lacks a user, do not use siUser inside this
export const getStudyAndOrgDisplayInfo = async (studyId: string) => {
    const res = await db
        .selectFrom('study')
        .innerJoin('user as researcher', 'study.researcherId', 'researcher.id')
        .leftJoin('user as reviewer', 'study.reviewerId', 'reviewer.id')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select([
            'study.orgId',
            'study.researcherId',
            'study.title',
            'reviewer.email as reviewerEmail',
            'reviewer.fullName as reviewerFullName',
            'researcher.email as researcherEmail',
            'researcher.fullName as researcherFullName',
            'org.slug as orgSlug',
            'org.name as orgName',
            'study.createdAt',
        ])
        .where('study.id', '=', studyId)
        .executeTakeFirstOrThrow(() => new Error('Study & Org not found'))

    if (!res) throw new Error('Study & Org not found')

    return res
}

export const getUserById = async (userId: string) => {
    return await db.selectFrom('user').selectAll('user').where('id', '=', userId).executeTakeFirstOrThrow()
}

export const getOrgInfoForUserId = async (userId: string) => {
    return await db
        .selectFrom('orgUser')
        .innerJoin('org', 'org.id', 'orgUser.orgId')
        .select(['org.id', 'org.slug', 'isAdmin', 'isResearcher', 'isReviewer'])
        .where('userId', '=', userId)
        .execute()
}

export const getStudyOrgIdForJobId = async (jobId: string) => {
    return await db
        .selectFrom('study')
        .innerJoin('studyJob', 'studyJob.studyId', 'study.id')
        .where('studyJob.id', '=', jobId)
        .select(['study.orgId'])
        .executeTakeFirstOrThrow()
}

export const getStudyOrgIdForStudyId = async (studyId: string) => {
    return await db.selectFrom('study').select('orgId').where('id', '=', studyId).executeTakeFirstOrThrow()
}

export const getOrgIdFromSlug = async ({ orgSlug }: { orgSlug: string }) => {
    return db.selectFrom('org').select(['org.id', 'org.slug']).where('slug', '=', orgSlug).executeTakeFirstOrThrow()
}

type JobDetails = { id: string; name: string; path: string }

export async function getStudyJobFileOfType(
    studyJobId: string,
    fileType: FileType,
    throwIfNotFound?: true,
): Promise<Selectable<JobDetails>>
export async function getStudyJobFileOfType(
    studyJobId: string,
    fileType: FileType,
    throwIfNotFound?: false,
): Promise<Selectable<JobDetails> | undefined>
export async function getStudyJobFileOfType(
    studyJobId: string,
    fileType: FileType,
    throwIfNotFound = true,
): Promise<Selectable<JobDetails> | undefined> {
    const file = await db
        .selectFrom('studyJobFile')
        .select(['studyJobFile.id', 'studyJobFile.name', 'studyJobFile.path'])
        .where('studyJobId', '=', studyJobId)
        .where('fileType', '=', fileType)
        .executeTakeFirst()

    if (!file && throwIfNotFound) {
        throw new Error(`File of type ${fileType} not found for study job ${studyJobId}`)
    }
    return file
}
