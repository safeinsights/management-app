import { db as defaultDb, jsonArrayFrom, type DBExecutor } from '@/database'
import type { RawStudyState } from '@/lib/study-screen'
import { hasStep2CollabDocSql } from '@/server/db/step2-collab-doc'

// The optional executor lets a mutation action run this gate on its own handler transaction.
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
            'study.piUserId',
            'study.datasets',
            'study.researchQuestions',
            'study.projectSummary',
            'study.impact',
            'study.additionalNotes',
        ])
        .select(hasStep2CollabDocSql.as('hasStep2CollabDoc'))
        .select((eb) => [
            jsonArrayFrom(
                eb
                    .selectFrom('studyJob')
                    .whereRef('studyJob.studyId', '=', 'study.id')
                    // Ordered for stable output only; projectStudyState re-selects by max(id).
                    .orderBy('studyJob.id', 'desc')
                    .select(['studyJob.id'])
                    .select((j) => [
                        jsonArrayFrom(
                            j
                                .selectFrom('jobStatusChange')
                                .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                                // createdAt is display-only; the projection never reads it.
                                .select(['jobStatusChange.status', 'jobStatusChange.createdAt']),
                        ).as('statusChanges'),
                    ]),
            ).as('jobs'),
        ])
        .executeTakeFirst()

    return row ?? null
}
