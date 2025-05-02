import { db, type DBExecutor } from '@/database'
import { currentUser as currentClerkUser, type User as ClerkUser } from '@clerk/nextjs/server'
import { CLERK_ADMIN_ORG_SLUG, MinimalJobResultsInfo } from '@/lib/types'
import { AccessDeniedError, throwAccessDenied, throwNotFound } from '@/lib/errors'
import { wasCalledFromAPI } from '../api-context'
import { findOrCreateSiUserId } from './mutations'
import { getUserIdFromActionContext } from '../actions/wrappers'

export const queryJobResult = async (jobId: string): Promise<MinimalJobResultsInfo | null> => {
    const results = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('org', 'study.orgId', 'org.id')
        .innerJoin('jobStatusChange', (st) =>
            st
                .onRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                .on('jobStatusChange.status', '=', 'RUN-COMPLETE'),
        )
        .select(['org.slug as orgSlug', 'studyJob.id as studyJobId', 'studyId', 'resultsPath'])
        .where('studyJob.id', '=', jobId)
        .executeTakeFirst()

    if (!results) return null

    return { ...results, resultsType: results.resultsPath ? 'APPROVED' : 'ENCRYPTED' } as MinimalJobResultsInfo
}

export const checkUserAllowedJobView = async (jobId?: string) => {
    if (!jobId) throw new AccessDeniedError(`not allowed access to study`)
    const userId = await getUserIdFromActionContext()

    await db
        .selectFrom('studyJob')
        .select('studyJob.id')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        // security, check that user is a org of the org that owns the study
        .innerJoin('orgUser', 'orgUser.orgId', 'study.orgId')
        .where('orgUser.userId', '=', userId)
        .where('studyJob.id', '=', jobId)
        .executeTakeFirstOrThrow(throwAccessDenied('job'))

    return true
}

export const checkUserAllowedStudyView = async (studyId?: string) => {
    if (!studyId) throw new AccessDeniedError(`not allowed access to study`)
    const userId = await getUserIdFromActionContext()

    await db
        .selectFrom('study')
        .select('study.id')
        // security, check that user is a org of the org that owns the study
        .innerJoin('orgUser', 'orgUser.orgId', 'study.orgId')
        .where('orgUser.userId', '=', userId)
        .where('study.id', '=', studyId)
        .executeTakeFirstOrThrow(throwAccessDenied('study'))

    return true
}

export const checkUserAllowedStudyReview = async (studyId?: string) => {
    if (!studyId) throw new AccessDeniedError(`not allowed access to study`)
    const userId = await getUserIdFromActionContext()

    await db
        .selectFrom('study')
        .select('study.id')
        // security, check that user is a org of the org that owns the study
        // and has the 'isReviewer' flag set
        .innerJoin('orgUser', 'orgUser.orgId', 'study.orgId')
        .where('orgUser.userId', '=', userId)
        .where('orgUser.isReviewer', '=', true)
        .where('study.id', '=', studyId)
        .executeTakeFirstOrThrow(throwAccessDenied('review study'))

    return true
}

export type SiUser = ClerkUser & {
    id: string
    isResearcher: boolean
}

export async function siUser(throwIfNotFound?: true): Promise<SiUser>
export async function siUser(throwIfNotFound?: false): Promise<SiUser | null>
export async function siUser(throwIfNotFound = true): Promise<SiUser | null> {
    const clerkUser = wasCalledFromAPI() ? null : await currentClerkUser()
    if (!clerkUser || clerkUser.banned) {
        if (throwIfNotFound) throw new AccessDeniedError('User not found')
        return null
    }

    const userId = await findOrCreateSiUserId(clerkUser.id, clerkUser)
    return {
        ...clerkUser,
        id: userId,
        isResearcher: true, // FIXME: we'll ned to update this once we have orgs orgship
    } as SiUser
}

export const getReviewerPublicKey = async (userId: string) => {
    const result = await db
        .selectFrom('userPublicKey')
        .select(['userPublicKey.publicKey'])
        .where('userPublicKey.userId', '=', userId)
        .executeTakeFirst()

    return result?.publicKey
}

export const getReviewerPublicKeyByUserId = async (userId: string) => {
    const result = await db
        .selectFrom('userPublicKey')
        .select(['userPublicKey.publicKey'])
        .where('userPublicKey.userId', '=', userId)
        .executeTakeFirst()

    return result?.publicKey
}

export type StudyJobWithLastStatus = Awaited<ReturnType<typeof latestJobForStudy>>
export const latestJobForStudy = async (
    studyId: string,
    { orgSlug, userId }: { orgSlug?: null | string; userId?: null | string } = {},
    conn: DBExecutor = db,
) => {
    return await conn
        .selectFrom('studyJob')
        .selectAll('studyJob')
        // security, check user has access to record
        .innerJoin('study', 'study.id', 'studyJob.studyId')

        .$if(Boolean(orgSlug), (qb) =>
            qb.innerJoin('org', (join) => join.on('org.slug', '=', orgSlug!).onRef('org.id', '=', 'study.orgId')),
        )
        .$if(Boolean(userId && !orgSlug), (qb) => qb.where('study.researcherId', '=', userId || ''))
        .innerJoin(
            // join to the latest status change
            (eb) =>
                eb
                    .selectFrom('jobStatusChange')
                    .orderBy('studyJobId', 'desc')
                    .orderBy('id', 'desc')
                    .distinctOn('studyJobId')
                    .select([
                        'jobStatusChange.studyJobId',
                        'createdAt as latestStatusChangeOccuredAt',
                        'status as latestStatus',
                    ])
                    .as('latestStatusChange'),
            (join) => join.onRef('latestStatusChange.studyJobId', '=', 'studyJob.id'),
        )
        .select(['latestStatusChange.latestStatus', 'latestStatusChange.latestStatusChangeOccuredAt'])
        .where('studyJob.studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirstOrThrow(throwNotFound('job for study'))
}

export const jobInfoForJobId = async (jobId: string) => {
    return await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select([
            'studyId',
            'studyJob.id as studyJobId',
            'org.slug as orgSlug',
            'studyJob.resultsPath',
            'studyJob.resultFormat',
        ])
        .where('studyJob.id', '=', jobId)
        .executeTakeFirstOrThrow()
}

export const studyInfoForStudyId = async (studyId: string) => {
    return await db
        .selectFrom('study')
        .innerJoin('org', 'study.orgId', 'org.id')
        .select(['study.id as studyId', 'org.slug as orgSlug'])
        .where('study.id', '=', studyId)
        .executeTakeFirst()
}

export async function getFirstOrganizationForUser(userId: string) {
    return db
        .selectFrom('org')
        .select(['org.id', 'org.slug', 'org.name'])
        .innerJoin('orgUser', 'orgUser.orgId', 'org.id')
        .where('orgUser.userId', '=', userId)
        .where('org.slug', '<>', CLERK_ADMIN_ORG_SLUG)
        .limit(1)
        .executeTakeFirst()
}

export const getUsersByRoleAndOrgId = async (role: 'researcher' | 'reviewer', orgId: string) => {
    const query = db
        .selectFrom('user')
        .innerJoin('orgUser', 'user.id', 'orgUser.userId')
        .innerJoin('org', 'orgUser.orgId', 'org.id')
        .selectAll()
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

export const getStudyAndOrg = async (studyId: string) => {
    const user = await siUser()

    const res = await db
        .selectFrom('study')
        .innerJoin('orgUser', (join) => join.on('userId', '=', user.id).onRef('orgUser.orgId', '=', 'study.orgId'))
        .innerJoin('user as researcher', (join) => join.onRef('study.researcherId', '=', 'researcher.id'))
        .innerJoin('org', 'org.id', 'study.orgId')
        .where('orgUser.userId', '=', user.id)
        .select([
            'study.id',
            'study.approvedAt',
            'study.rejectedAt',
            'study.containerLocation',
            'study.createdAt',
            'study.dataSources',
            'study.irbProtocols',
            'study.orgId',
            'study.outputMimeType',
            'study.piName',
            'study.researcherId',
            'study.status',
            'study.title',
            'study.descriptionDocPath',
            'study.irbDocPath',
            'study.reviewerId',
            'study.agreementDocPath',
            'researcher.fullName as researcherName',
            'org.slug as orgSlug',
            'org.name as orgName',
        ])
        .selectAll('org')
        .where('study.id', '=', studyId)
        .executeTakeFirst()

    if (!res) throw new Error('Study & Org not found')

    return res
}
