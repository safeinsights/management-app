'use server'

import { ActionSuccessType } from '@/lib/types'
import { orgSchema, updateOrgSchema, type PublicOrg } from '@/schema/org'
import { revalidatePath } from 'next/cache'
import { orgIdFromSlug } from '../db/queries'
import { Action, z } from './action'
import { Language } from '@/database/types'

// Mass-assignment path: overwriting settings.publicKey would let an org admin forge M2M API JWTs,
// and flipping type lab->enclave grants reviewer abilities — hence ('manage','all') (MA-5).
export const updateOrgAction = new Action('updateOrgAction', { performsMutations: true })
    .params(updateOrgSchema)
    .requireAbilityTo('manage', 'all')
    .handler(async ({ params: { id, ...update }, db }) => {
        return await db.updateTable('org').set(update).where('id', '=', id).returningAll().executeTakeFirstOrThrow()
    })

export const insertOrgAction = new Action('insertOrgAction')
    .params(orgSchema)
    .middleware(async ({ params: { slug } }) => ({ orgSlug: slug }))
    .requireAbilityTo('create', 'Org')
    .handler(async ({ db, params: org }) => {
        return await db.insertInto('org').values(org).returningAll().executeTakeFirstOrThrow()
    })

export const fetchUsersOrgsAction = new Action('fetchUsersOrgsAction')
    .requireAbilityTo('view', 'Orgs')
    .handler(async ({ db, session }) => {
        return await db
            .selectFrom('orgUser')
            .innerJoin('org', 'org.id', 'orgUser.orgId')
            .select(['org.id', 'org.name', 'org.slug', 'org.type'])
            .where('orgUser.userId', '=', session.user.id)
            .execute()
    })

// Returns every org's email and settings, including enclave publicKeys; the SI-admin console
// layout applies no gate, so this check is the only one (MA-6).
export const fetchAdminOrgsWithStatsAction = new Action('fetchAdminOrgsWithStatsAction')
    .requireAbilityTo('manage', 'all')
    .handler(async ({ db }) => {
        return await db
            .selectFrom('org')
            .leftJoin('study', 'study.orgId', 'org.id')
            .leftJoin('orgUser', 'orgUser.orgId', 'org.id')
            .leftJoin('orgCodeEnv', 'orgCodeEnv.orgId', 'org.id')
            .leftJoin('orgDataSource', 'orgDataSource.orgId', 'org.id')
            .select([
                'org.id',
                'org.name',
                'org.email',
                'org.slug',
                'org.type',
                'org.settings',
                (eb) => eb.fn.count('orgUser.id').distinct().as('totalUsers'),
                (eb) => eb.fn.count('study.id').distinct().as('totalStudies'),
                (eb) => eb.fn.count('orgCodeEnv.id').distinct().as('totalCodeEnvs'),
                (eb) => eb.fn.count('orgDataSource.id').distinct().as('totalDataSources'),
            ])
            .groupBy(['org.id'])
            .execute()
    })

export const deleteOrgAction = new Action('deleteOrgAction')
    .params(z.object({ orgId: z.string() }))
    .requireAbilityTo('delete', 'Org')
    .handler(async ({ db, params: { orgId } }) => db.deleteFrom('org').where('id', '=', orgId).execute())

// Cross-org by design. Selects catalog columns only — keep it that way (MA-6).
export const getStudyCapableEnclaveOrgsAction = new Action('getStudyCapableEnclaveOrgsAction')
    .requireAbilityTo('view', 'Orgs')
    .handler(async ({ db }) => {
        return await db
            .selectFrom('org')
            .select(['org.slug', 'org.name', 'org.type'])
            .where((eb) =>
                eb.exists(
                    eb
                        .selectFrom('orgCodeEnv')
                        .select('orgCodeEnv.id')
                        .whereRef('orgCodeEnv.orgId', '=', 'org.id')
                        .where('orgCodeEnv.isTesting', '=', false),
                ),
            )
            .where('org.type', '=', 'enclave')
            .orderBy('org.name', 'asc')
            .execute()
    })

type StarterCodeUrl = { fileName: string; url: string }
type LanguageOption = {
    value: Language
    label: string
    starterCodeUrls: StarterCodeUrl[]
    commandLines: Record<string, string>
}

// Cross-org by design: a researcher needs the chosen enclave's languages to begin a proposal (MA-6).
export const getLanguagesForOrgAction = new Action('getLanguagesForOrgAction')
    .requireAbilityTo('view', 'Orgs')
    .params(z.object({ orgSlug: z.string().min(1) }))
    .handler(async ({ db, params: { orgSlug } }) => {
        const { languageLabels } = await import('@/lib/languages')
        const { signedUrlForFile } = await import('@/server/aws')

        const org = await db
            .selectFrom('org')
            .select(['name', 'id'])
            .where('slug', '=', orgSlug)
            .executeTakeFirstOrThrow()

        const rows = await db
            .selectFrom('orgCodeEnv')
            .select([
                'orgCodeEnv.id',
                'orgCodeEnv.language',
                'orgCodeEnv.starterCodeFileNames',
                'orgCodeEnv.commandLines',
            ])
            .where('orgCodeEnv.orgId', '=', org.id)
            .where('orgCodeEnv.isTesting', '=', false)
            .distinctOn('orgCodeEnv.language')
            .orderBy('orgCodeEnv.language')
            .orderBy('orgCodeEnv.createdAt', 'desc')
            .execute()

        const { pathForStarterCode } = await import('@/lib/paths')

        const languages = await Promise.all(
            rows.map(async (l) => ({
                value: l.language,
                label: languageLabels[l.language],
                starterCodeUrls: await Promise.all(
                    l.starterCodeFileNames.map(async (fileName) => ({
                        fileName,
                        url: await signedUrlForFile(pathForStarterCode({ orgSlug, codeEnvId: l.id, fileName })),
                    })),
                ),
                commandLines: l.commandLines,
            })),
        )

        return {
            orgName: org.name,
            languages: languages as LanguageOption[],
        }
    })

// Cross-org download is the intended researcher flow, so this stays on `view Orgs`; the admin
// console's editor view is fetchStarterCodeAction, scoped via `view OrgConfig` (MA-6).
export const getStarterCodeUrlAction = new Action('getStarterCodeUrlAction')
    .requireAbilityTo('view', 'Orgs')
    .params(z.object({ orgSlug: z.string(), language: z.string() }))
    .handler(async ({ db, params: { orgSlug, language } }) => {
        const { signedUrlForFile } = await import('@/server/aws')
        const { pathForStarterCode } = await import('@/lib/paths')

        const org = await db.selectFrom('org').select(['id']).where('slug', '=', orgSlug).executeTakeFirstOrThrow()

        const row = await db
            .selectFrom('orgCodeEnv')
            .select(['orgCodeEnv.id', 'orgCodeEnv.starterCodeFileNames'])
            .where('orgCodeEnv.orgId', '=', org.id)
            .where('orgCodeEnv.language', '=', language as Language)
            .where('orgCodeEnv.isTesting', '=', false)
            .orderBy('orgCodeEnv.createdAt', 'desc')
            .executeTakeFirst()

        if (!row?.starterCodeFileNames?.length) {
            return { starterCodeUrls: [] as StarterCodeUrl[] }
        }

        const starterCodeUrls = await Promise.all(
            row.starterCodeFileNames.map(async (fileName) => ({
                fileName,
                url: await signedUrlForFile(pathForStarterCode({ orgSlug, codeEnvId: row.id, fileName }), {
                    ResponseContentDisposition: 'inline',
                }),
            })),
        )

        return { starterCodeUrls }
    })

// On the unconditioned `view Org`, so the row is read in the HANDLER and narrowed to PublicOrg:
// a middleware read would echo settings and email back in the permission_denied message (MA-6).
export const getOrgFromSlugAction = new Action('getOrgFromSlugAction')
    .params(z.object({ orgSlug: z.string() }))
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'Org')
    .handler(
        async ({ db, orgId }): Promise<PublicOrg> =>
            await db
                .selectFrom('org')
                .select(['id', 'slug', 'name', 'type', 'description'])
                .where('id', '=', orgId)
                .executeTakeFirstOrThrow(),
    )

export type OrgUserReturn = ActionSuccessType<typeof getUsersForOrgAction>[number]

// The field list is the whitelist that makes ('update','Org') safe for every org admin: keep type,
// slug, email and settings out of it (MA-5).
export const updateOrgSettingsAction = new Action('updateOrgSettingsAction', { performsMutations: true })
    .params(
        z.object({
            orgSlug: z.string(),
            name: z.string().trim().min(1, 'Name is required').max(50, 'Name cannot exceed 50 characters'),
            description: z.string().max(250, 'Description cannot exceed 250 characters').nullable().optional(),
        }),
    )
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ db, orgId, params: { orgSlug, name, description } }) => {
        await db.updateTable('org').set({ name, description }).where('id', '=', orgId).executeTakeFirstOrThrow()

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
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'User')
    .handler(async ({ db, params: { orgSlug, sort } }) => {
        return await db
            .selectFrom('orgUser')
            .innerJoin('org', 'org.id', 'orgUser.orgId')
            .innerJoin('user', 'user.id', 'orgUser.userId')
            .leftJoin(
                (eb) =>
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
