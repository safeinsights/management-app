'use server'

import { type DBExecutor, jsonArrayFrom } from '@/database'
import { StudyJobStatus } from '@/database/types'
import { throwNotFound } from '@/lib/errors'
import { ActionSuccessType, jobFileSchema } from '@/lib/types'
import { getStudyJobFileOfType, latestJobForStudy } from '@/server/db/queries'
import { onStudyApproved, onStudyCodeRejected, onStudyRejected } from '@/server/events'
import { storeApprovedJobFile } from '@/server/storage'
import { triggerBuildImageForJob } from '../aws'
import { SIMULATE_CODE_BUILD } from '../config'
import { Action, z } from './action'
import { sql } from 'kysely'
import { computeNeedsAttention, type StudyWithJobChanges, type ViewRecord } from './compute-needs-attention'

async function fetchViewRecords(
    db: DBExecutor,
    studyIds: string[],
    audience: 'researcher' | 'reviewer',
    userId: string,
    enclaveOrgId?: string,
): Promise<ViewRecord[]> {
    try {
        if (audience === 'reviewer' && enclaveOrgId) {
            return await db
                .selectFrom('studyView as sv')
                .innerJoin('orgUser as ou', (join) =>
                    join.onRef('ou.userId', '=', 'sv.userId').on('ou.orgId', '=', enclaveOrgId),
                )
                .select(['sv.studyId', sql<Date>`max(sv.viewed_at)`.as('viewedAt')])
                .where('sv.studyId', 'in', studyIds)
                .groupBy('sv.studyId')
                .execute()
        }
        if (audience === 'reviewer') {
            // My Dashboard case: no specific enclaveOrgId, but we still need org-wide
            // view checking. Per spec, data org numbers clear when anyone on the org views.
            return await db
                .selectFrom('studyView as sv')
                .innerJoin('study as s', 's.id', 'sv.studyId')
                .innerJoin('orgUser as ou', (join) =>
                    join.onRef('ou.userId', '=', 'sv.userId').onRef('ou.orgId', '=', 's.orgId'),
                )
                .select(['sv.studyId', sql<Date>`max(sv.viewed_at)`.as('viewedAt')])
                .where('sv.studyId', 'in', studyIds)
                .groupBy('sv.studyId')
                .execute()
        }
        return await db
            .selectFrom('studyView')
            .select(['studyView.studyId', 'studyView.viewedAt'])
            .where('studyView.studyId', 'in', studyIds)
            .where('studyView.userId', '=', userId)
            .execute()
    } catch {
        // study_view table may not exist yet if migration hasn't run
        return []
    }
}

async function enrichWithNeedsAttention<T extends StudyWithJobChanges & { latestStatusChangedAt?: Date | null }>(
    db: DBExecutor,
    studies: T[],
    audience: 'researcher' | 'reviewer',
    userId: string,
    enclaveOrgId?: string,
): Promise<(T & { needsAttention: boolean })[]> {
    if (studies.length === 0) return []
    const studyIds = studies.map((s) => s.id)
    const viewRecords = await fetchViewRecords(db, studyIds, audience, userId, enclaveOrgId)
    const viewMap = new Map(viewRecords.map((v) => [v.studyId, v]))

    return studies.map((study) => ({
        ...study,
        needsAttention: computeNeedsAttention(
            study,
            audience,
            viewMap.get(study.id),
            study.latestStatusChangedAt ?? undefined,
        ),
    }))
}

// NOT exported, for internal use by actions in this file
function fetchStudyQuery(db: DBExecutor) {
    return db
        .selectFrom('study')
        .leftJoin(
            // Subquery to get the most recent study job for each study
            (eb) =>
                eb
                    .selectFrom('studyJob')
                    .select(['studyJob.studyId', 'studyJob.id as jobId', 'studyJob.createdAt as studyJobCreatedAt'])
                    .distinctOn('studyId')
                    .orderBy('studyId')
                    .orderBy('createdAt', 'desc')
                    .as('latestStudyJob'),
            (join) => join.onRef('latestStudyJob.studyId', '=', 'study.id'),
        )
        .select((eb) => [
            jsonArrayFrom(
                eb
                    .selectFrom('jobStatusChange')
                    .select(['jobStatusChange.status', 'jobStatusChange.userId'])
                    .whereRef('jobStatusChange.studyJobId', '=', 'latestStudyJob.jobId')
                    .orderBy('studyJobId')
                    .orderBy('createdAt', 'desc'),
            ).as('jobStatusChanges'),
            // Timestamp of the latest status change (for view-tracking comparison)
            // Uses GREATEST across job status changes and study-level status timestamps
            // so that proposal approvals/rejections (which don't create job status changes)
            // are still tracked for view comparison
            sql<Date>`greatest(
                (SELECT jsc.created_at FROM job_status_change jsc
                 WHERE jsc.study_job_id = latest_study_job.job_id
                 ORDER BY jsc.created_at DESC LIMIT 1),
                study.approved_at,
                study.rejected_at
            )`.as('latestStatusChangedAt'),
        ])
        .innerJoin('user as researcher', (join) => join.onRef('study.researcherId', '=', 'researcher.id'))
        .leftJoin('user as reviewer', (join) => join.onRef('study.reviewerId', '=', 'reviewer.id'))
        .select([
            'study.id',
            'study.approvedAt',
            'study.rejectedAt',
            'study.containerLocation',
            'study.createdAt',
            'study.datasets',
            'study.dataSources',
            'study.irbProtocols',
            'study.orgId',
            'study.submittedByOrgId',
            'study.outputMimeType',
            'study.piName',
            'study.reviewerId',
            'study.researcherId',
            'study.researchQuestions',
            'study.projectSummary',
            'study.impact',
            'study.additionalNotes',
            'study.status',
            'study.title',
            'researcher.fullName as createdBy',
            'reviewer.fullName as reviewerName',
            'latestStudyJob.jobId as latestStudyJobId',
        ])

        .orderBy('study.createdAt', 'desc')
}

export const fetchStudiesForOrgAction = new Action('fetchStudiesForOrgAction')
    .params(z.object({ orgSlug: z.string() }))
    .middleware(
        async ({ params: { orgSlug }, db }) =>
            await db
                .selectFrom('org')
                .select(['id as orgId', 'type as orgType'])
                .where('slug', '=', orgSlug)
                .executeTakeFirst(),
    )
    .requireAbilityTo('view', 'OrgStudies')
    .handler(async ({ db, orgId, orgType, session }) => {
        const userId = session.user.id
        const audience = orgType === 'enclave' ? 'reviewer' : 'researcher'
        let query = fetchStudyQuery(db)
        if (orgType === 'enclave') {
            query = query.where('study.orgId', '=', orgId).where('study.status', '!=', 'DRAFT')
        }
        if (orgType === 'lab') {
            query = query
                .where('study.submittedByOrgId', '=', orgId)
                .where((eb) => eb.or([eb('study.status', '!=', 'DRAFT'), eb('study.researcherId', '=', userId)]))
        }
        const studies = await query
            .innerJoin('org as reviewerOrg', 'reviewerOrg.id', 'study.orgId')
            .innerJoin('org as submittingOrg', 'submittingOrg.id', 'study.submittedByOrgId')
            .select(['reviewerOrg.name as reviewingEnclaveName'])
            .select(['submittingOrg.name as submittingLabName'])
            .execute()
        return enrichWithNeedsAttention(db, studies, audience, userId, orgType === 'enclave' ? orgId : undefined)
    })

export const fetchStudiesForCurrentResearcherUserAction = new Action('fetchStudiesForCurrentResearcherUserAction')
    .requireAbilityTo('view', 'Studies')
    .handler(async ({ db, session }) => {
        const userId = session.user.id
        const studies = await fetchStudyQuery(db)
            .where((eb) => eb.or([eb('study.status', '!=', 'DRAFT'), eb('study.researcherId', '=', userId)]))
            .innerJoin('org', 'org.id', 'study.orgId')
            .innerJoin('org as submittingOrg', 'submittingOrg.id', 'study.submittedByOrgId')
            .select(['org.name as orgName', 'org.slug as orgSlug', 'submittingOrg.slug as submittedByOrgSlug'])
            .execute()
        return enrichWithNeedsAttention(db, studies, 'researcher', userId)
    })

export const fetchStudiesForCurrentReviewerAction = new Action('fetchStudiesForCurrentReviewerAction')
    .requireAbilityTo('view', 'Studies')
    .handler(async ({ db, session }) => {
        const userId = session.user.id
        const userOrgs = Object.values(session.orgs)
        const reviewerOrgIds = userOrgs.filter((org) => org.type === 'enclave').map((org) => org.id)
        if (reviewerOrgIds.length === 0) {
            return []
        }
        const studies = await fetchStudyQuery(db)
            .where('study.orgId', 'in', reviewerOrgIds)
            .where('study.status', '!=', 'DRAFT')
            .innerJoin('org', 'org.id', 'study.orgId')
            .select(['org.name as orgName', 'org.slug as orgSlug'])
            .execute()
        return enrichWithNeedsAttention(db, studies, 'reviewer', userId)
    })

export const getStudyAction = new Action('getStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await fetchStudyQuery(db)
            .where('study.id', '=', studyId)
            .innerJoin('org', 'org.id', 'study.orgId')
            .innerJoin('org as submittingOrg', 'submittingOrg.id', 'study.submittedByOrgId')
            .select([
                'org.slug as orgSlug',
                'submittingOrg.slug as submittedByOrgSlug',
                'study.descriptionDocPath',
                'study.irbDocPath',
                'study.agreementDocPath',
                'study.language',
            ])
            .executeTakeFirstOrThrow(throwNotFound('Study'))
        return { study, orgId: study.orgId, submittedByOrgId: study.submittedByOrgId }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ study }) => {
        return study
    })

export type SelectedStudy = ActionSuccessType<typeof getStudyAction>

export const approveStudyProposalAction = new Action('approveStudyProposalAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.string(),
            orgSlug: z.string(),
            useTestImage: z.boolean().optional(),
            jobFiles: z.array(jobFileSchema).optional(),
        }),
    )
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['status', 'orgId', 'containerLocation'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { study, orgId: study.orgId }
    })
    .requireAbilityTo('approve', 'Study')
    .handler(async ({ params: { studyId, orgSlug, useTestImage, jobFiles }, study, session, db }) => {
        const userId = session.user.id
        const alreadyApproved = study.status === 'APPROVED'

        const latestJob = await db
            .selectFrom('studyJob')
            .select('id')
            .where('studyId', '=', studyId)
            .orderBy('createdAt', 'desc')
            .executeTakeFirst()

        if (alreadyApproved && !latestJob) return

        if (latestJob) {
            const job = await latestJobForStudy(studyId)

            if (alreadyApproved) {
                const latestJobStatus = job.statusChanges.at(0)?.status
                if (latestJobStatus !== 'CODE-SCANNED') return
            }

            let status: StudyJobStatus = 'CODE-APPROVED'

            // if we're not connected to AWS codebuild, then containers will never build so just mark it ready
            if (SIMULATE_CODE_BUILD) {
                status = 'JOB-READY'
            } else {
                // TODO: the code environment should be chosen by the user (if admin) when they create the study
                // but for now we just use the latest code environment for the org and language
                const image = await db
                    .selectFrom('orgCodeEnv')
                    .where('language', '=', job.language)
                    .where('orgId', '=', study.orgId)
                    .where('isTesting', '=', useTestImage || false)
                    .orderBy('orgCodeEnv.createdAt', 'desc')
                    .select(['url', 'cmdLine'])
                    .executeTakeFirstOrThrow(
                        throwNotFound(`no code environment found for org ${orgSlug} and language ${job.language}`),
                    )

                const mainCode = await getStudyJobFileOfType(job.id, 'MAIN-CODE')

                await triggerBuildImageForJob({
                    studyJobId: job.id,
                    studyId,
                    orgSlug: orgSlug,
                    containerLocation: study.containerLocation,
                    codeEntryPointFileName: mainCode.name,
                    cmdLine: image.cmdLine,
                    codeEnvURL: image.url,
                })
            }

            await db
                .insertInto('jobStatusChange')
                .values({
                    userId,
                    status,
                    studyJobId: job.id,
                })
                .executeTakeFirstOrThrow()

            if (jobFiles?.length) {
                const info = { studyId, studyJobId: job.id, orgSlug }
                for (const jobFile of jobFiles) {
                    const file = new File([jobFile.contents], jobFile.path)
                    await storeApprovedJobFile(info, file, jobFile.fileType, jobFile.sourceId)
                }
            }
        }

        if (!alreadyApproved) {
            await db
                .updateTable('study')
                .set({ status: 'APPROVED', approvedAt: new Date(), rejectedAt: null, reviewerId: userId })
                .where('id', '=', studyId)
                .execute()

            onStudyApproved({ studyId, userId })
        }
    })

export const rejectStudyProposalAction = new Action('rejectStudyProposalAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.string(),
            orgSlug: z.string(),
        }),
    )
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['orgId'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { study, orgId: study.orgId }
    })
    .requireAbilityTo('reject', 'Study')
    .handler(async ({ params: { studyId }, session, db }) => {
        const userId = session.user.id

        await db
            .updateTable('study')
            .set({ status: 'REJECTED', rejectedAt: new Date(), approvedAt: null, reviewerId: userId })
            .where('id', '=', studyId)
            .execute()

        const latestJob = await db
            .selectFrom('studyJob')
            .select('id')
            .where('studyId', '=', studyId)
            .orderBy('createdAt', 'desc')
            .executeTakeFirst()

        if (latestJob) {
            await db
                .insertInto('jobStatusChange')
                .values({
                    userId,
                    status: 'CODE-REJECTED',
                    studyJobId: latestJob.id,
                })
                .executeTakeFirstOrThrow()
            onStudyCodeRejected({ studyId, userId })
        } else {
            onStudyRejected({ studyId, userId })
        }
    })

export const markStudyAsViewedAction = new Action('markStudyAsViewedAction', { performsMutations: true })
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['orgId', 'submittedByOrgId'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { orgId: study.orgId, submittedByOrgId: study.submittedByOrgId }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ db, session, params: { studyId } }) => {
        try {
            const study = await db.selectFrom('study').select(['status']).where('id', '=', studyId).executeTakeFirst()

            const latestJobStatus = await db
                .selectFrom('studyJob')
                .innerJoin('jobStatusChange', 'jobStatusChange.studyJobId', 'studyJob.id')
                .select(['jobStatusChange.status'])
                .where('studyJob.studyId', '=', studyId)
                .orderBy('studyJob.createdAt', 'desc')
                .orderBy('jobStatusChange.createdAt', 'desc')
                .limit(1)
                .executeTakeFirst()

            await db
                .insertInto('studyView')
                .values({
                    studyId,
                    userId: session.user.id,
                    studyStatusAtView: study?.status ?? null,
                    jobStatusAtView: latestJobStatus?.status ?? null,
                })
                .onConflict((oc) =>
                    oc.columns(['studyId', 'userId']).doUpdateSet({
                        studyStatusAtView: study?.status ?? null,
                        jobStatusAtView: latestJobStatus?.status ?? null,
                        viewedAt: sql`now()`,
                    }),
                )
                .execute()
        } catch {
            // study_view table may not exist yet if migration hasn't run
        }
    })

export const doesTestImageExistForStudyAction = new Action('doesTestImageExistForStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => {
        const latestJob = await latestJobForStudy(studyId)
        return { latestJob, orgId: latestJob.orgId }
    })
    .requireAbilityTo('approve', 'Study')
    .handler(async ({ latestJob, db }) => {
        const testImage = await db
            .selectFrom('orgCodeEnv')
            .select('id')
            .where('orgId', '=', latestJob.orgId)
            .where('language', '=', latestJob.language)
            .where('isTesting', '=', true)
            .executeTakeFirst()

        return !!testImage
    })
