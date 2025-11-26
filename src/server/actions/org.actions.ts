'use server'

import { ActionSuccessType } from '@/lib/types'
import { orgSchema, updateOrgSchema } from '@/schema/org'
import { revalidatePath } from 'next/cache'
import { getReviewerPublicKeyByUserId, orgIdFromSlug } from '../db/queries'
import { Action, z } from './action'

export const updateOrgAction = new Action('updateOrgAction', { performsMutations: true })
    .params(updateOrgSchema)
    .middleware(async ({ params: { id } }) => ({ orgId: id })) // translate params for requireAbility below
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params: { id, ...update }, db }) => {
        return await db.updateTable('org').set(update).where('id', '=', id).returningAll().executeTakeFirstOrThrow()
    })

export const insertOrgAction = new Action('insertOrgAction')
    .params(orgSchema)
    .middleware(async ({ params: { slug } }) => ({ orgSlug: slug })) // translate params for requireAbility below
    .requireAbilityTo('create', 'Org')
    .handler(async ({ db, params: org }) => {
        return await db.insertInto('org').values(org).returningAll().executeTakeFirstOrThrow()
    })

export const getOrgFromIdAction = new Action('getOrgFromIdAction')
    .params(z.object({ orgId: z.string() }))
    .requireAbilityTo('view', 'Org')
    .handler(async ({ db, params: { orgId } }) => {
        return await db.selectFrom('org').selectAll('org').where('id', '=', orgId).executeTakeFirst()
    })

export const fetchUsersOrgsWithStatsAction = new Action('fetchUsersOrgsWithStatsAction')
    .requireAbilityTo('view', 'Orgs')
    .handler(async ({ db, session }) => {
        // Latest job per study
        const latestStudyJob = db
            .selectFrom('studyJob')
            .select(['studyJob.studyId as studyId', 'studyJob.id as jobId'])
            .distinctOn('studyId')
            .orderBy('studyId')
            .orderBy('createdAt', 'desc')
            .as('latestStudyJob')

        // Latest status per latest job
        const latestStatusPerStudy = db
            .selectFrom(latestStudyJob)
            .innerJoin(
                (eb) =>
                    eb
                        .selectFrom('jobStatusChange')
                        .select(['jobStatusChange.studyJobId', 'jobStatusChange.status'])
                        .distinctOn('studyJobId')
                        .orderBy('studyJobId')
                        .orderBy('createdAt', 'desc')
                        .as('latestStatus'),
                (join) => join.onRef('latestStatus.studyJobId', '=', 'latestStudyJob.jobId'),
            )
            .select(['latestStudyJob.studyId as studyId', 'latestStatus.status as status'])
            .as('latestStatusPerStudy')

        // Counts for Lab orgs (Research Labs)
        const labCounts = db
            .selectFrom('study as s')
            .leftJoin(latestStatusPerStudy, (join) => join.onRef('latestStatusPerStudy.studyId', '=', 's.id'))
            .select((eb) => ['s.submittedByOrgId as orgId', eb.fn.count('s.id').distinct().as('count')])
            .where('s.researcherId', '=', session.user.id)
            .where((eb) =>
                eb.or([
                    eb('s.status', 'in', ['APPROVED', 'REJECTED']),
                    eb('latestStatusPerStudy.status', 'in', ['JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']),
                ]),
            )
            .groupBy('s.submittedByOrgId')
            .as('labCounts')

        // Counts for Enclave orgs (Data Orgs)
        const enclaveCounts = db
            .selectFrom('study as s')
            .leftJoin(latestStatusPerStudy, (join) => join.onRef('latestStatusPerStudy.studyId', '=', 's.id'))
            .select((eb) => ['s.orgId as orgId', eb.fn.count('s.id').distinct().as('count')])
            .where((eb) =>
                eb.or([
                    eb('s.status', '=', 'PENDING-REVIEW'),
                    eb('latestStatusPerStudy.status', 'in', ['JOB-ERRORED', 'RUN-COMPLETE']),
                ]),
            )
            .groupBy('s.orgId')
            .as('enclaveCounts')

        return await db
            .selectFrom('orgUser')
            .innerJoin('org', 'org.id', 'orgUser.orgId')
            .leftJoin(labCounts, (join) => join.onRef('labCounts.orgId', '=', 'org.id').on('org.type', '=', 'lab'))
            .leftJoin(enclaveCounts, (join) =>
                join.onRef('enclaveCounts.orgId', '=', 'org.id').on('org.type', '=', 'enclave'),
            )
            .select((eb) => [
                'org.id',
                'org.name',
                'org.slug',
                'org.type',
                eb.fn.coalesce('labCounts.count', eb.fn.coalesce('enclaveCounts.count', eb.val(0))).as('eventCount'),
            ])
            .where('orgUser.userId', '=', session.user.id)
            .execute()
    })

export const fetchAdminOrgsWithStatsAction = new Action('fetchAdminOrgsWithStatsAction')
    .requireAbilityTo('view', 'Orgs')
    .handler(async ({ db }) => {
        return await db
            .selectFrom('org')
            .leftJoin('study', 'study.orgId', 'org.id')
            .leftJoin('orgUser', 'orgUser.orgId', 'org.id')
            .select([
                'org.id',
                'org.name',
                'org.email',
                'org.slug',
                'org.type',
                'org.settings',
                (eb) => eb.fn.count('orgUser.id').distinct().as('totalUsers'),
                (eb) => eb.fn.count('study.id').distinct().as('totalStudies'),
            ])
            .groupBy(['org.id'])
            .execute()
    })

export const deleteOrgAction = new Action('deleteOrgAction')
    .params(z.object({ orgId: z.string() }))
    .requireAbilityTo('delete', 'Org')
    .handler(async ({ db, params: { orgId } }) => db.deleteFrom('org').where('id', '=', orgId).execute())

export type ListAllOrgsResult = ActionSuccessType<typeof listAllOrgsAction>

export const listAllOrgsAction = new Action('listAllOrgsAction')
    .requireAbilityTo('view', 'Orgs')
    .handler(async ({ db }) => {
        const rows = await db
            .selectFrom('org')
            .leftJoin('orgBaseImage', (join) =>
                join.onRef('orgBaseImage.orgId', '=', 'org.id').on('orgBaseImage.isTesting', '=', false),
            )
            .select(['org.slug', 'org.name', 'org.type', 'orgBaseImage.language'])
            .orderBy('org.name', 'asc')
            .execute()

        const bySlug = new Map<
            string,
            { slug: string; name: string; type: (typeof rows)[number]['type']; languages: Set<'R' | 'PYTHON'> }
        >()

        for (const row of rows) {
            let entry = bySlug.get(row.slug)
            if (!entry) {
                entry = { slug: row.slug, name: row.name, type: row.type, languages: new Set() }
                bySlug.set(row.slug, entry)
            }
            if (row.language === 'R' || row.language === 'PYTHON') {
                entry.languages.add(row.language)
            }
        }

        return Array.from(bySlug.values()).map((entry) => ({
            slug: entry.slug,
            name: entry.name,
            type: entry.type,
            supportedLanguages: Array.from(entry.languages),
        }))
    })

export const getOrgFromSlugAction = new Action('getOrgFromSlugAction')
    .params(z.object({ orgSlug: z.string() }))
    .middleware(async ({ db, params: { orgSlug } }) => {
        const org = await db.selectFrom('org').selectAll('org').where('slug', '=', orgSlug).executeTakeFirstOrThrow()
        return { org, orgId: org.id }
    })
    .requireAbilityTo('view', 'Org')
    .handler(async ({ org }) => org)

// TODO: move this to a more appropriate place, likely a reviewers.actions.ts file
// also all we really need is if they have a public key, so we can just return a boolean
export const getReviewerPublicKeyAction = new Action('getReviewerPublicKeyAction')
    .requireAbilityTo('view', 'ReviewerKey')
    .handler(async ({ session }) => getReviewerPublicKeyByUserId(session.user.id))

export type OrgUserReturn = ActionSuccessType<typeof getUsersForOrgAction>[number]

export const updateOrgSettingsAction = new Action('updateOrgSettingsAction')
    .params(
        z.object({
            orgSlug: z.string(),
            name: z.string().trim().min(1, 'Name is required').max(50, 'Name cannot exceed 50 characters'),
            description: z.string().max(250, 'Word limit is 250 characters').nullable().optional(),
        }),
    )
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ db, orgId, params: { orgSlug, name, description } }) => {
        await db.updateTable('org').set({ name, description }).where('id', '=', orgId).executeTakeFirstOrThrow()

        // If both DB and Clerk updates are successful
        revalidatePath(`/admin/team/${orgSlug}/settings`)
        revalidatePath(`/admin/team/${orgSlug}`)

        return { success: true, message: 'Organization settings updated successfully.' }
    })

export const getUsersForOrgAction = new Action('getUsersForOrgAction')
    .params(
        z.object({
            orgSlug: z.string(),
            sort: z.object({
                columnAccessor: z.enum(['fullName']),
                direction: z.enum(['asc', 'desc']),
            }),
        }),
    )
    .requireAbilityTo('view', 'User')
    .handler(async ({ db, params: { orgSlug, sort } }) => {
        return await db
            .selectFrom('orgUser')
            .innerJoin('org', 'org.id', 'orgUser.orgId')
            .innerJoin('user', 'user.id', 'orgUser.userId')
            .leftJoin(
                (
                    eb, // join to the latest activity from audit
                ) =>
                    eb
                        .selectFrom('audit')
                        .distinctOn('audit.userId')
                        .select(['audit.userId', 'audit.createdAt'])
                        .orderBy('audit.userId', 'desc')
                        .orderBy('audit.createdAt', 'desc')
                        .as('latestAuditEntry'),
                (join) => join.onRef('latestAuditEntry.userId', '=', 'orgUser.userId'),
            )
            .select([
                'user.id',
                'user.fullName',
                'user.createdAt',
                'user.email',
                'orgUser.id as orgUserId',
                'orgUser.isAdmin',
                'org.type as orgType',
                'latestAuditEntry.createdAt as latestActivityAt',
            ])
            .where('org.slug', '=', orgSlug)
            .orderBy(sort.columnAccessor, sort.direction)
            .execute()
    })
