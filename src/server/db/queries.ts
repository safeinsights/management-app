import { db, type DBExecutor } from '@/database'
import { currentUser as currentClerkUser, type User as ClerkUser } from '@clerk/nextjs/server'
import { CLERK_ADMIN_ORG_SLUG, MinimalJobResultsInfo } from '@/lib/types'
import { AccessDeniedError, throwAccessDenied, throwNotFound } from '@/lib/errors'
import { wasCalledFromAPI } from '../context'
import { findOrCreateSiUserId } from './mutations'
import { getUserIdFromActionContext } from '../actions/wrappers'

export const queryJobResult = async (jobId: string): Promise<MinimalJobResultsInfo | null> => {
    const results = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', 'study.memberId', 'member.id')
        .innerJoin('jobStatusChange', (st) =>
            st
                .onRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                .on('jobStatusChange.status', '=', 'RUN-COMPLETE'),
        )
        .select(['member.slug as memberSlug', 'studyJob.id as studyJobId', 'studyId', 'resultsPath'])
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
        // security, check that user is a member of the org that owns the study
        .innerJoin('memberUser', 'memberUser.memberId', 'study.memberId')
        .where('memberUser.userId', '=', userId)
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
        // security, check that user is a member of the org that owns the study
        .innerJoin('memberUser', 'memberUser.memberId', 'study.memberId')
        .where('memberUser.userId', '=', userId)
        .where('study.id', '=', studyId)
        .executeTakeFirstOrThrow(throwAccessDenied('study'))

    return true
}

export const checkMemberAllowedStudyReview = async (studyId?: string) => {
    if (!studyId) throw new AccessDeniedError(`not allowed access to study`)
    const userId = await getUserIdFromActionContext()

    await db
        .selectFrom('study')
        .select('study.id')
        // security, check that user is a member of the org that owns the study
        // and has the 'isReviewer' flag set
        .innerJoin('memberUser', 'memberUser.memberId', 'study.memberId')
        .where('memberUser.userId', '=', userId)
        .where('memberUser.isReviewer', '=', true)
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
        isResearcher: true, // FIXME: we'll ned to update this once we have orgs membership
    } as SiUser
}

export const getMemberUserPublicKey = async (userId: string) => {
    const result = await db
        .selectFrom('userPublicKey')
        .select(['userPublicKey.publicKey'])
        .where('userPublicKey.userId', '=', userId)
        .executeTakeFirst()

    return result?.publicKey
}

export const getMemberUserPublicKeyByUserId = async (userId: string) => {
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
    // if (!orgSlug && !userId) {
    //     throw new AccessDeniedError('must provide user or org slug')
    // }

    return await conn
        .selectFrom('studyJob')
        .selectAll('studyJob')
        // security, check user has access to record
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .$if(Boolean(orgSlug), (qb) =>
            qb.innerJoin('member', (join) =>
                join.on('member.slug', '=', orgSlug!).onRef('member.id', '=', 'study.memberId'),
            ),
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
        .innerJoin('member', 'member.id', 'study.memberId')
        .select([
            'studyId',
            'studyJob.id as studyJobId',
            'member.slug as memberSlug',
            'studyJob.resultsPath',
            'studyJob.resultFormat',
        ])
        .where('studyJob.id', '=', jobId)
        .executeTakeFirstOrThrow()
}

export const studyInfoForStudyId = async (studyId: string) => {
    return await db
        .selectFrom('study')
        .innerJoin('member', 'study.memberId', 'member.id')
        .select(['study.id as studyId', 'member.slug as memberSlug'])
        .where('study.id', '=', studyId)
        .executeTakeFirst()
}

export async function getFirstOrganizationForUser(userId: string) {
    return db
        .selectFrom('member')
        .select(['member.id', 'member.slug', 'member.name'])
        .innerJoin('memberUser', 'memberUser.memberId', 'member.id')
        .where('memberUser.userId', '=', userId)
        .where('member.slug', '<>', CLERK_ADMIN_ORG_SLUG)
        .limit(1)
        .executeTakeFirst()
}
