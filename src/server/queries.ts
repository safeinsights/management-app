import { db } from '@/database'
import { currentUser as currentClerkUser, type User as ClerkUser } from '@clerk/nextjs/server'
import { MinimalJobResultsInfo } from '@/lib/types'
import { wasCalledFromAPI } from './context'
import { findOrCreateSiUserId } from '@/server/db/mutations'

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

type SiUser = ClerkUser & {
    id: string
    isResearcher: boolean
}

export async function siUser(throwIfNotFound?: true): Promise<SiUser>
export async function siUser(throwIfNotFound?: false): Promise<SiUser | null>
export async function siUser(throwIfNotFound = true): Promise<SiUser | null> {
    const clerkUser = wasCalledFromAPI() ? null : await currentClerkUser()

    if (!clerkUser || clerkUser.banned) {
        if (throwIfNotFound) throw new Error('User not logged in')
        return null
    }

    const userId = await findOrCreateSiUserId(clerkUser.id, clerkUser)
    return {
        ...clerkUser,
        id: userId,
        isResearcher: true, // FIXME: we'll ned to update this once we have orgs membership
    } as SiUser
}
