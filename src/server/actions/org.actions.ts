'use server'

import { ActionSuccessType } from '@/lib/types'
import { orgSchema, updateOrgSchema, type PublicOrg } from '@/schema/org'
import { revalidatePath } from 'next/cache'
import { orgIdFromSlug } from '../db/queries'
import { Action, z } from './action'
import { Language } from '@/database/types'

// Mass-assignment path: updateOrgSchema is a discriminated union of the CREATE schemas, so it
// carries `type`, `slug`, `email` and `settings`. `settings.publicKey` is the RS256 key that
// verifies an enclave's M2M API bearer tokens — an org admin who could overwrite it would forge
// API JWTs as that enclave, and flipping `type` lab->enclave grants reviewer abilities. So this is
// gated on ('manage','all') rather than the org-admin-scoped ('update','Org'). Its only caller is
// the SI-admin console (EditOrgForm), which already required SI staff. Org admins edit their own
// org through updateOrgSettingsAction below, which whitelists name + description (OTTER-724 / MA-5).
export const updateOrgAction = new Action('updateOrgAction', { performsMutations: true })
    .params(updateOrgSchema)
    .requireAbilityTo('manage', 'all')
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

// Returns EVERY org's email and settings (including enclave publicKeys). Its only callers live in
// the SI-admin console, whose layout applies no admin gate, so this check is the sole gate
// (OTTER-724 / MA-6).
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

// Cross-org by design: a lab researcher picks the enclave to submit to, so this must list enclaves
// the caller does not belong to. Selects catalog columns only — keep it that way (OTTER-724 / MA-6).
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

// Cross-org by design, like getStudyCapableEnclaveOrgsAction: after choosing an enclave, the
// researcher needs its languages and starter-code downloads to begin a proposal (OTTER-724 / MA-6).
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

// Cross-org starter-code download is the intended researcher flow, so this stays on `view Orgs`.
// The admin console's editor view of the same files is fetchStarterCodeAction, which is scoped to
// that org's admins via `view OrgConfig` (OTTER-724 / MA-6).
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

// Sits on the unconditioned `view Org`, so the row read happens in the HANDLER and is narrowed to
// PublicOrg. It previously selected the whole row in MIDDLEWARE, which both handed `settings`
// (an enclave's publicKey) and `email` to any authenticated caller and echoed them back inside the
// permission_denied message to a caller who was refused (OTTER-724 / MA-6).
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

// The org-admin-scoped update path. The field list here is the whitelist: it is the reason
// ('update','Org') can safely be granted to every org admin, so keep `type`, `slug`, `email` and
// `settings` out of it — those belong to updateOrgAction's SI-admin path (OTTER-724 / MA-5).
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
    .middleware(orgIdFromSlug)
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
