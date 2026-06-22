import { db, jsonArrayFrom } from '@/database'
import type { RawStudyState } from '@/lib/study-screen'

export async function rawStudyStateForStudy(studyId: string): Promise<RawStudyState | null> {
    const row = await db
        .selectFrom('study')
        .where('study.id', '=', studyId)
        .select([
            'study.status',
            'study.approvedAt',
            'study.rejectedAt',
            'study.researcherAgreementsAckedAt',
            'study.reviewerAgreementsAckedAt',
            'study.language',
            'study.proposalResubmissionNoteDraft',
            'study.codeResubmissionNoteDraft',
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
                        jsonArrayFrom(
                            j
                                .selectFrom('studyJobFile')
                                .whereRef('studyJobFile.studyJobId', '=', 'studyJob.id')
                                .select(['studyJobFile.fileType']),
                        ).as('files'),
                    ]),
            ).as('jobs'),
        ])
        .executeTakeFirst()

    return row ?? null
}
