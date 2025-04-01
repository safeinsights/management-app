import { db, type DBExecutor } from '@/database'
import { currentUser as currentClerkUser, type User as ClerkUser } from '@clerk/nextjs/server'
import { MinimalJobResultsInfo } from '@/lib/types'
import { AccessDeniedError, throwAccessDenied } from '@/lib/errors'
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
        .select(['member.identifier as memberIdentifier', 'studyJob.id as studyJobId', 'studyId', 'resultsPath'])

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

export const getMemberUserPublicKeyByClerkId = async (clerkId: string) => {
    const result = await db
        .selectFrom('userPublicKey')
        .select(['userPublicKey.publicKey'])
        .innerJoin('user', 'user.id', 'userPublicKey.userId')
        .where('user.clerkId', '=', clerkId)
        .executeTakeFirst()

    return result?.publicKey
}

export const latestJobForStudy = async (studyId: string, conn: DBExecutor = db) => {
    return await conn
        .selectFrom('studyJob')
        .selectAll('studyJob')

        .where('studyJob.studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirst()
}

export const jobInfoForJobId = async (jobId: string) => {
    return await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', 'member.id', 'study.memberId')
        .select([
            'studyId',
            'studyJob.id as studyJobId',
            'member.identifier as memberIdentifier',
            'studyJob.resultsPath',
            'studyJob.resultFormat',
        ])
        .where('studyJob.id', '=', jobId)
        .executeTakeFirstOrThrow()
}
