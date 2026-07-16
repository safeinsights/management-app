import { db as defaultDb, jsonArrayFrom, type DBExecutor } from '@/database'
import type { RawStudyState } from '@/lib/study-screen'

// Accepts an optional executor (mirrors codeSubmissionVersion) so a mutation action can run this gate
// on its own handler transaction rather than the module singleton. Pages call it with the default.
export async function rawStudyStateForStudy(
    studyId: string,
    db: DBExecutor = defaultDb,
): Promise<RawStudyState | null> {
    const row = await db
        .selectFrom('study')
        .where('study.id', '=', studyId)
        .select([
            'study.status',
            'study.approvedAt',
            'study.rejectedAt',
            'study.researcherAgreementsAckedAt',
            'study.reviewerAgreementsAckedAt',
            'study.proposalResubmissionNoteDraft',
            'study.codeResubmissionNoteDraft',
            // OTTER-636: distinguishes a revision draft from a fresh draft for reviewer routing/pill.
            'study.proposalRevisionBaseSubmissionId',
            // Step 2 fields → hasStep2Progress (OTTER-572 draft resume).
            'study.piUserId',
            'study.datasets',
            'study.researchQuestions',
            'study.projectSummary',
            'study.impact',
            'study.additionalNotes',
        ])
        .select((eb) => [
            jsonArrayFrom(
                eb
                    .selectFrom('studyJob')
                    .whereRef('studyJob.studyId', '=', 'study.id')
                    // jobs ordered by id desc for stable output; correctness does NOT depend on order
                    // (projectStudyState re-selects the latest job by max(id)).
                    .orderBy('studyJob.id', 'desc')
                    .select(['studyJob.id'])
                    .select((j) => [
                        jsonArrayFrom(
                            j
                                .selectFrom('jobStatusChange')
                                .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                                .select(['jobStatusChange.status']),
                        ).as('statusChanges'),
                    ]),
            ).as('jobs'),
        ])
        .executeTakeFirst()

    return row ?? null
}
