'use server'

import { type DBExecutor, jsonArrayFrom } from '@/database'
import { StudyJobStatus } from '@/database/types'
import { ActionFailure, throwNotFound } from '@/lib/errors'
import { ActionSuccessType } from '@/lib/types'
import { getStudyJobFileOfType, latestJobForStudy } from '@/server/db/queries'
import { onStudyApproved, onStudyRejected } from '@/server/events'
import { triggerBuildImageForJob } from '../aws'
import { SIMULATE_IMAGE_BUILD } from '../config'
import { Action, z } from './action'

// NOT exported, for internal use by actions in this file
function fetchStudiesQuery(db: DBExecutor, orgId: string) {
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
                    .select(['jobStatusChange.status'])
                    .whereRef('jobStatusChange.studyJobId', '=', 'latestStudyJob.jobId')
                    .orderBy('studyJobId')
                    .orderBy('createdAt', 'desc'),
            ).as('jobStatusChanges'),
        ])
        .where('study.orgId', '=', orgId)
}

export const fetchStudiesForOrgAction = new Action('fetchStudiesForOrgAction')
    .params(z.object({ orgSlug: z.string() }))
    .middleware(async ({ params: { orgSlug }, db }) => {
        const org = await db
            .selectFrom('org')
            .select(['id as orgId'])
            .where('slug', '=', orgSlug)
            .executeTakeFirstOrThrow()
        return { orgId: org.orgId }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ session, db }) => {
        return fetchStudiesQuery(db, session.team.id)
            .innerJoin('user as researcher', (join) => join.onRef('study.researcherId', '=', 'researcher.id'))
            .leftJoin('user as reviewer', (join) => join.onRef('study.reviewerId', '=', 'reviewer.id'))
            .select([
                'study.id',
                'study.approvedAt',
                'study.rejectedAt',
                'study.containerLocation',
                'study.createdAt',
                'study.dataSources',
                'study.irbProtocols',
                'study.orgId',
                'study.outputMimeType',
                'study.piName',
                'study.researcherId',
                'study.status',
                'study.title',
                'researcher.fullName as createdBy',
                'reviewer.fullName as reviewerName',
                'latestStudyJob.jobId as latestStudyJobId',
            ])
            .orderBy('study.createdAt', 'desc')
            .execute()
    })

export const fetchStudiesForCurrentResearcherAction = new Action('fetchStudiesForCurrentResearcherAction')
    .middleware(async ({ session }) => {
        if (!session) throw new ActionFailure({ user: 'Unauthorized' })
        return { orgId: session.team.id }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ session, db }) => {
        return await fetchStudiesQuery(db, session.team.id)
            .innerJoin('org', 'org.id', 'study.orgId')
            .select([
                'study.id',
                'study.title',
                'study.piName',
                'study.status',
                'study.createdAt',
                'org.name as reviewerTeamName',
                'latestStudyJob.jobId as latestStudyJobId',
            ])
            .orderBy('study.createdAt', 'desc')
            .execute()
    })

export const getStudyAction = new Action('getStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .innerJoin('user as researcher', (join) => join.onRef('study.researcherId', '=', 'researcher.id'))
            .select([
                'study.id',
                'study.approvedAt',
                'study.rejectedAt',
                'study.containerLocation',
                'study.createdAt',
                'study.dataSources',
                'study.irbProtocols',
                'study.orgId',
                'study.outputMimeType',
                'study.piName',
                'study.researcherId',
                'study.status',
                'study.title',
                'study.descriptionDocPath',
                'study.irbDocPath',
                'study.reviewerId',
                'study.agreementDocPath',
            ])
            .select('researcher.fullName as createdBy')
            .where('study.id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('Study'))

        return { study, orgId: study.orgId }
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
    .handler(async ({ params: { studyId, orgSlug, useTestImage }, study, session, db }) => {
        const userId = session.user.id

        // nothing to do if already approved
        if (study.status == 'APPROVED') return

        // will throw if not found
        const latestJob = await latestJobForStudy(studyId)

        let status: StudyJobStatus = 'CODE-APPROVED'

        // if we're not connected to AWS codebuild, then containers will never build so just mark it ready
        if (SIMULATE_IMAGE_BUILD) {
            status = 'JOB-READY'
        } else {
            // TODO: the base image should be chosen by the user (if admin) when they create the study
            // but for now we just use the latest base image for the org and language
            const image = await db
                .selectFrom('orgBaseImage')
                .where('language', '=', latestJob.language)
                .where('orgId', '=', study.orgId)
                .where('isTesting', '=', useTestImage || false)
                .orderBy('orgBaseImage.createdAt', 'desc')
                .select(['url', 'cmdLine'])
                .executeTakeFirstOrThrow(
                    throwNotFound(`no base image found for org ${orgSlug} and language ${latestJob.language}`),
                )

            const mainCode = await getStudyJobFileOfType(latestJob.id, 'MAIN-CODE')

            await triggerBuildImageForJob({
                studyJobId: latestJob.id,
                studyId,
                orgSlug: orgSlug,
                containerLocation: study.containerLocation,
                codeEntryPointFileName: mainCode.name,
                cmdLine: image.cmdLine,
                baseImageURL: image.url,
            })
        }

        await db
            .updateTable('study')
            .set({ status: 'APPROVED', approvedAt: new Date(), rejectedAt: null, reviewerId: session.user.id })
            .where('id', '=', studyId)
            .execute()

        await db
            .insertInto('jobStatusChange')
            .values({
                userId,
                status,
                studyJobId: latestJob.id,
            })
            .executeTakeFirstOrThrow()

        onStudyApproved({ studyId, userId })
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

        const latestJob = await latestJobForStudy(studyId)
        await db
            .insertInto('jobStatusChange')
            .values({
                userId: userId,
                status: 'CODE-REJECTED',
                studyJobId: latestJob.id,
            })
            .executeTakeFirstOrThrow()

        onStudyRejected({ studyId, userId })
    })
