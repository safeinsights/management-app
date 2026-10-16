import { type DBExecutor, jsonArrayFrom } from '@/database'
import { sql } from 'kysely'
import { hasStep2CollabDocSql } from '@/server/db/step2-collab-doc'

// Soft-delete applies to DRAFTs only and is scoped to dashboard listings; direct reads by id stay
// lifecycle-agnostic, so stale editor tabs and bookmarked URLs remain a known gap.
export function fetchStudyQuery(db: DBExecutor) {
    return db
        .selectFrom('study')
        .where('study.deletedAt', 'is', null)
        .leftJoin(
            (eb) =>
                eb
                    .selectFrom('studyJob')
                    .select(['studyJob.studyId', 'studyJob.id as jobId', 'studyJob.createdAt as studyJobCreatedAt'])
                    .distinctOn('studyId')
                    .orderBy('studyId')
                    .orderBy('createdAt', 'desc')
                    // v7 id breaks createdAt ties so the job picked here is deterministic.
                    .orderBy('studyJob.id', 'desc')
                    .as('latestStudyJob'),
            (join) => join.onRef('latestStudyJob.studyId', '=', 'study.id'),
        )
        .select((eb) => [
            jsonArrayFrom(
                eb
                    .selectFrom('jobStatusChange')
                    .select(['jobStatusChange.status', 'jobStatusChange.userId', 'jobStatusChange.createdAt'])
                    .whereRef('jobStatusChange.studyJobId', '=', 'latestStudyJob.jobId')
                    .orderBy('studyJobId')
                    .orderBy('createdAt', 'desc')
                    .orderBy('jobStatusChange.id', 'desc'),
            ).as('jobStatusChanges'),
            jsonArrayFrom(
                eb
                    .selectFrom('orgDataSource')
                    .select(['orgDataSource.id', 'orgDataSource.name'])
                    .where(sql<boolean>`"org_data_source"."id"::text = ANY("study"."datasets")`),
            ).as('orgDataSources'),
        ])
        .innerJoin('user as researcher', (join) => join.onRef('study.researcherId', '=', 'researcher.id'))
        .leftJoin('user as reviewer', (join) => join.onRef('study.reviewerId', '=', 'reviewer.id'))
        .select([
            'study.id',
            'study.approvedAt',
            'study.rejectedAt',
            'study.containerLocation',
            'study.createdAt',
            'study.submittedAt',
            'study.lastUpdatedAt',
            'study.datasets',
            'study.dataSources',
            'study.irbProtocols',
            'study.orgId',
            'study.submittedByOrgId',
            'study.outputMimeType',
            'study.piName',
            'study.piUserId',
            'study.reviewerId',
            'study.researcherId',
            'study.researchQuestions',
            'study.projectSummary',
            'study.impact',
            'study.additionalNotes',
            'study.status',
            'study.title',
            'study.isTestStudy',
            'study.researcherAgreementsAckedAt',
            'study.reviewerAgreementsAckedAt',
            'study.codeResubmissionNoteDraft',
            'study.proposalResubmissionNoteDraft',
            'researcher.fullName as createdBy',
            'reviewer.fullName as reviewerName',
            'latestStudyJob.jobId as latestStudyJobId',
        ])
        .select(hasStep2CollabDocSql.as('hasStep2CollabDoc'))
        .orderBy('study.lastUpdatedAt', 'desc')
}
