import type { DBExecutor } from '@/database'

// Outside queries/ so mutations.ts can load it without the queries index, which pulls in Clerk's
// Next.js server module that bin scripts and seeds cannot load. `submitted` skips a job still waiting
// for its first submission, so a round that has only just opened does not mask the code under review.
export function latestJobQuery(executor: DBExecutor, studyId: string, { submitted = false } = {}) {
    const query = executor
        .selectFrom('studyJob')
        .where('studyJob.studyId', '=', studyId)
        .orderBy('studyJob.round', 'desc')
        .orderBy('studyJob.id', 'desc')
        .limit(1)
    return submitted ? query.where('studyJob.currentStatus', '!=', 'INITIATED') : query
}
