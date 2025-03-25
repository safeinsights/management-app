import { db } from '@/database'
import { currentUser as currentClerkUser, type User as ClerkUser } from '@clerk/nextjs/server'
import { AccessDeniedError, MinimalJobResultsInfo } from '@/lib/types'
import { wasCalledFromAPI } from '../context'
import { findOrCreateSiUserId } from './mutations'
import { getUserIdFromActionContext } from '../actions/wrappers'

export const queryJobResult = async (jobId: string) =>
    (await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', 'study.memberId', 'member.id')
        .select(['studyJob.id as studyJobId', 'studyId', 'resultsPath', 'member.identifier as memberIdentifier'])
        .where('studyJob.id', '=', jobId)
        .innerJoin('jobStatusChange', (st) =>
            st
                .onRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                .on('jobStatusChange.status', '=', 'RUN-COMPLETE'),
        )
        .where('studyJob.resultsPath', 'is not', null)
        .executeTakeFirst()) as MinimalJobResultsInfo | undefined

export const checkMemberAllowedStudyReview = async (studyId: string, userId = getUserIdFromActionContext()) => {
    const found = await db
        .selectFrom('study')
        .select('study.id')
        .innerJoin('memberUser', (join) =>
            join
                .on('memberUser.userId', '=', userId)
                .on('memberUser.isReviewer', '=', true)
                .onRef('memberUser.memberId', '=', 'study.memberId'),
        )
        .where('study.id', '=', studyId)
        .executeTakeFirst()

    if (!found) throw new AccessDeniedError(`not allowed access to study`)
    return true
}

export const checkMemberAllowedStudyRead = async (studyId: string, userId = getUserIdFromActionContext()) => {
    const found = await db
        .selectFrom('study')
        .select('study.id')
        .innerJoin('memberUser', (join) =>
            join
                .on('memberUser.userId', '=', userId)
                .on('memberUser.isReviewer', '=', true)
                .onRef('memberUser.memberId', '=', 'study.memberId'),
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
