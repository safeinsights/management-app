import { db } from '@/database'
import { currentUser as currentClerkUser } from '@clerk/nextjs/server'
import { MinimalJobResultsInfo } from '@/lib/types'

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

export const siUser = async () => {
    const clerkUser = await currentClerkUser()
    if (!clerkUser || clerkUser.banned) throw new Error('Not Signed In')

    let user = await db
        .selectFrom('user')
        .select(['id', 'isResearcher'])
        .where('clerkId', '=', clerkUser.id)
        .executeTakeFirst()

    if (!user) {
        user = await db
            .insertInto('user')
            .values({
                name: clerkUser.fullName || 'unknown',
                clerkId: clerkUser.id,
                isResearcher: true, // FIXME: we'll ned to update this once we have orgs membership
            })
            .returningAll()
            .executeTakeFirstOrThrow()
    }

    return {
        ...clerkUser,
        id: user.id,
        isRsearcher: user.isResearcher,
    }
}
