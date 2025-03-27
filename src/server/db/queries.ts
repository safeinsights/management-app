import { db, type DBExecutor } from '@/database'
import { currentUser as currentClerkUser, type User as ClerkUser } from '@clerk/nextjs/server'
import { AccessDeniedError, MinimalJobResultsInfo } from '@/lib/types'
import { wasCalledFromAPI } from '../context'
import { findOrCreateSiUserId } from './mutations'
import { getOrgSlugFromActionContext } from '../actions/wrappers'

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

export const checkMemberAllowedStudyReview = async (studyId: string, identifier = getOrgSlugFromActionContext()) => {
    const found = await db
        .selectFrom('study')
        .select('study.id')
        .innerJoin('member', (join) =>
            join.on('member.identifier', '=', identifier).onRef('study.memberId', '=', 'member.id'),
        )
        .where('study.id', '=', studyId)
        .executeTakeFirst()

    if (!found) throw new AccessDeniedError(`not allowed access to study`)
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

        // security, check user has access to record
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', (join) =>
            join.on('member.identifier', '=', getOrgSlugFromActionContext()).onRef('member.id', '=', 'study.memberId'),
        )

        .where('studyJob.studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirst()
}
