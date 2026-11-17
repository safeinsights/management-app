'use server'

import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import { revalidatePath } from 'next/cache'
import { Action, ActionFailure } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { jsonArrayFrom } from '@/database'
import { throwNotFound } from '@/lib/errors'
import { deleteFolderContents, createSignedUploadUrl, triggerScanForCodeEnv } from '@/server/aws'
import { pathForStarterCode, pathForStarterCodePrefix } from '@/lib/paths'
import { dockerImageRefSchema, identifierRegex } from '@/schema/code-env'
import { fetchFileContents } from '@/server/storage'
import { SIMULATE_CODE_BUILD } from '@/server/config'
import { insertFakeCodeScan } from '@/server/actions/simulate-scan'
import logger from '@/lib/logger'
import type { DB, Language } from '@/database/types'
import type { Kysely } from 'kysely'
import { Routes } from '@/lib/routes'
import { AUDITED_CODE_ENV_FIELDS, diffFields } from '@/lib/audit-diff'
import { onCodeEnvCreated, onCodeEnvDeleted, onCodeEnvUpdated } from '@/server/events'

const priorCodeEnvFor = (db: Kysely<DB>, codeEnvId: string) =>
    db
        .selectFrom('orgCodeEnv')
        .select([...AUDITED_CODE_ENV_FIELDS])
        .where('id', '=', codeEnvId)
        .executeTakeFirstOrThrow()

const usableCodeEnvErrors = {
    delete: {
        lastNonTesting: (language: Language) =>
            `Cannot delete the last non-testing ${language} code environment. At least one non-testing code environment must exist for each language.`,
        onlyScanPassed: (language: Language) =>
            `Cannot delete the only ${language} code environment that passed scanning. At least one scan-passed, non-testing code environment must exist for each language.`,
    },
    update: {
        lastNonTesting: (language: Language) =>
            `Cannot mark the last non-testing ${language} code environment as testing or change its language. At least one non-testing code environment must exist for each language.`,
        onlyScanPassed: (language: Language) =>
            `Cannot mark the only ${language} code environment that passed scanning as testing or change its language. At least one scan-passed, non-testing code environment must exist for each language.`,
    },
}

// Throws if removing this non-testing env from its language's pool (by delete, or by an edit
// that makes it testing or moves it to another language) would leave no usable default image.
const assertLanguageKeepsUsableCodeEnv = async (
    db: Kysely<DB>,
    { id, orgId, language }: { id: string; orgId: string; language: Language },
    change: keyof typeof usableCodeEnvErrors,
) => {
    const nonTesting = await db
        .selectFrom('orgCodeEnv')
        .select((eb) => [
            'orgCodeEnv.id',
            eb
                .selectFrom('codeScan')
                .select('codeScan.status')
                .whereRef('codeScan.codeEnvId', '=', 'orgCodeEnv.id')
                .orderBy('codeScan.createdAt', 'desc')
                .limit(1)
                .as('latestScanStatus'),
        ])
        .where('orgCodeEnv.orgId', '=', orgId)
        .where('orgCodeEnv.language', '=', language)
        .where('orgCodeEnv.isTesting', '=', false)
        // Without the lock, two concurrent edits each count the other env as the one that remains.
        .forUpdate()
        .execute()

    const beingRemoved = nonTesting.find((env) => env.id === id)
    const others = nonTesting.filter((env) => env.id !== id)

    if (others.length === 0) {
        throw new ActionFailure(usableCodeEnvErrors[change].lastNonTesting(language))
    }

    // OTTER-527: removing the last passing env would make the language's default image
    // fall back to one that failed or never finished scanning.
    const removingPassedEnv = beingRemoved?.latestScanStatus === 'SCAN-COMPLETE'
    const anotherPassedEnvExists = others.some((env) => env.latestScanStatus === 'SCAN-COMPLETE')

    if (removingPassedEnv && !anotherPassedEnvExists) {
        throw new ActionFailure(usableCodeEnvErrors[change].onlyScanPassed(language))
    }
}

const codeEnvFromOrgAndId = async ({
    params: { orgSlug, codeEnvId },
    db,
}: {
    params: { orgSlug: string; codeEnvId: string }
    db: Kysely<DB>
}) => {
    const codeEnv = await db
        .selectFrom('orgCodeEnv')
        .innerJoin('org', 'org.id', 'orgCodeEnv.orgId')
        .select([
            'orgCodeEnv.id',
            'orgCodeEnv.starterCodeFileNames',
            'orgCodeEnv.url',
            'org.slug as orgSlug',
            'org.id as orgId',
        ])
        .where('org.slug', '=', orgSlug)
        .where('orgCodeEnv.id', '=', codeEnvId)
        .executeTakeFirstOrThrow()

    return { codeEnv, orgId: codeEnv.orgId }
}

const envVarSchema = z.object({
    name: z.string(),
    value: z.string(),
})

const codeEnvSettingsSchema = z.object({
    environment: z.array(envVarSchema).optional().default([]),
})

const createOrgCodeEnvSchema = z.object({
    orgSlug: z.string(),
    name: z.string(),
    identifier: z.string().regex(identifierRegex, 'Invalid identifier'),
    language: z.enum(['R', 'PYTHON']),
    commandLines: z.record(z.string(), z.string()),
    url: dockerImageRefSchema,
    starterCodeFileNames: z.array(z.string()).min(1),
    isTesting: z.boolean().default(false),
    settings: codeEnvSettingsSchema.optional().default({ environment: [] }),
    dataSourceIds: z.array(z.uuid()).default([]),
})

export const createOrgCodeEnvAction = new Action('createOrgCodeEnvAction', { performsMutations: true })
    .params(createOrgCodeEnvSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, orgId, db, session }) => {
        const { orgSlug, starterCodeFileNames, dataSourceIds, ...fieldValues } = params

        if (dataSourceIds.length > 0) {
            const matched = await db
                .selectFrom('orgDataSource')
                .select('id')
                .where('id', 'in', dataSourceIds)
                .where('orgId', '=', orgId)
                .execute()
            if (matched.length !== dataSourceIds.length) {
                throw new ActionFailure('One or more data sources not found for this organization')
            }
        }

        const id = uuidv7()

        const newCodeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                id,
                orgId,
                ...fieldValues,
                settings: fieldValues.settings,
                commandLines: fieldValues.commandLines,
                starterCodeFileNames,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await onCodeEnvCreated({
            db,
            codeEnvId: newCodeEnv.id,
            userId: session.user.id,
            changes: diffFields({}, newCodeEnv, AUDITED_CODE_ENV_FIELDS),
            starterCodeReplaced: true,
            name: newCodeEnv.name,
        })

        if (dataSourceIds.length > 0) {
            await db
                .insertInto('orgDataSourceCodeEnv')
                .values(dataSourceIds.map((dataSourceId) => ({ dataSourceId, codeEnvId: id })))
                .execute()
        }

        revalidatePath(Routes.adminSettings({ orgSlug }))

        if (SIMULATE_CODE_BUILD) {
            await insertFakeCodeScan(newCodeEnv.id, db)
        } else {
            await db.insertInto('codeScan').values({ codeEnvId: newCodeEnv.id, status: 'SCAN-PENDING' }).execute()

            triggerScanForCodeEnv({ codeEnvId: newCodeEnv.id, imageUrl: newCodeEnv.url }).catch((err) =>
                logger.error('Failed to trigger scan for new code env', err, { codeEnvId: newCodeEnv.id }),
            )
        }

        return newCodeEnv
    })

const updateOrgCodeEnvSchema = z.object({
    orgSlug: z.string(),
    codeEnvId: z.string(),
    name: z.string(),
    identifier: z.string().regex(identifierRegex, 'Invalid identifier'),
    language: z.enum(['R', 'PYTHON']),
    commandLines: z.record(z.string(), z.string()),
    url: dockerImageRefSchema,
    starterCodeFileNames: z.array(z.string()).optional(),
    starterCodeUploaded: z.boolean().optional(),
    isTesting: z.boolean().default(false),
    settings: codeEnvSettingsSchema.optional().default({ environment: [] }),
    dataSourceIds: z.array(z.uuid()).default([]),
})

export const updateOrgCodeEnvAction = new Action('updateOrgCodeEnvAction', { performsMutations: true })
    .params(updateOrgCodeEnvSchema)
    .middleware(async (args) => {
        const { codeEnv, orgId } = await codeEnvFromOrgAndId(args)
        return { ...codeEnv, orgId }
    })
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, starterCodeFileNames: prevStarterCodeFileNames, url: prevUrl, orgId, db, session }) => {
        const { orgSlug, codeEnvId, starterCodeFileNames, starterCodeUploaded, dataSourceIds, ...fieldValues } = params

        // Read after the check: the prior row's settings hold plaintext env var values.
        const priorCodeEnv = await priorCodeEnvFor(db, codeEnvId)

        // Must run before any S3 or DB side effect so a refused edit changes nothing.
        if (!priorCodeEnv.isTesting && (fieldValues.isTesting || fieldValues.language !== priorCodeEnv.language)) {
            await assertLanguageKeepsUsableCodeEnv(
                db,
                { id: codeEnvId, orgId, language: priorCodeEnv.language },
                'update',
            )
        }

        if (dataSourceIds.length > 0) {
            const matched = await db
                .selectFrom('orgDataSource')
                .select('id')
                .where('id', 'in', dataSourceIds)
                .where('orgId', '=', orgId)
                .execute()
            if (matched.length !== dataSourceIds.length) {
                throw new ActionFailure('One or more data sources not found for this organization')
            }
        }

        let currentFileNames = prevStarterCodeFileNames
        if (starterCodeUploaded && starterCodeFileNames?.length) {
            await deleteFolderContents(pathForStarterCodePrefix({ orgSlug, codeEnvId }))
            currentFileNames = starterCodeFileNames
        }

        const updatedCodeEnv = await db
            .updateTable('orgCodeEnv')
            .set({
                ...fieldValues,
                settings: fieldValues.settings,
                commandLines: fieldValues.commandLines,
                starterCodeFileNames: currentFileNames,
            })
            .where('id', '=', codeEnvId)
            .returningAll()
            .executeTakeFirstOrThrow()

        await onCodeEnvUpdated({
            db,
            codeEnvId,
            userId: session.user.id,
            changes: diffFields(priorCodeEnv, updatedCodeEnv, AUDITED_CODE_ENV_FIELDS),
            // Mirrors the condition that gated the S3 wipe above, so this records what the
            // server did rather than what the client claimed.
            starterCodeReplaced: Boolean(starterCodeUploaded && starterCodeFileNames?.length),
            name: updatedCodeEnv.name,
        })

        await db.deleteFrom('orgDataSourceCodeEnv').where('codeEnvId', '=', codeEnvId).execute()
        if (dataSourceIds.length > 0) {
            await db
                .insertInto('orgDataSourceCodeEnv')
                .values(dataSourceIds.map((dataSourceId) => ({ dataSourceId, codeEnvId })))
                .execute()
        }

        revalidatePath(Routes.adminSettings({ orgSlug }))

        if (updatedCodeEnv.url !== prevUrl) {
            if (SIMULATE_CODE_BUILD) {
                await insertFakeCodeScan(updatedCodeEnv.id, db)
            } else {
                await db
                    .insertInto('codeScan')
                    .values({ codeEnvId: updatedCodeEnv.id, status: 'SCAN-PENDING' })
                    .execute()

                triggerScanForCodeEnv({ codeEnvId: updatedCodeEnv.id, imageUrl: updatedCodeEnv.url }).catch((err) =>
                    logger.error('Failed to trigger scan for updated code env', err, {
                        codeEnvId: updatedCodeEnv.id,
                    }),
                )
            }
        }

        return updatedCodeEnv
    })

const fetchOrgCodeEnvsSchema = z.object({
    orgSlug: z.string(),
})

// selectAll includes settings.environment (plaintext env vars, often credentials), so this is
// admin-console data, not public catalog data.
export const fetchOrgCodeEnvsAction = new Action('fetchOrgCodeEnvsAction')
    .params(fetchOrgCodeEnvsSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'OrgConfig')
    .handler(async ({ orgId, db }) => {
        return await db
            .selectFrom('orgCodeEnv')
            .selectAll('orgCodeEnv')
            .select((eb) => [
                eb
                    .selectFrom('codeScan')
                    .select('codeScan.status')
                    .whereRef('codeScan.codeEnvId', '=', 'orgCodeEnv.id')
                    .orderBy('codeScan.createdAt', 'desc')
                    .limit(1)
                    .as('latestScanStatus'),
                eb
                    .selectFrom('codeScan')
                    .select('codeScan.results')
                    .whereRef('codeScan.codeEnvId', '=', 'orgCodeEnv.id')
                    .orderBy('codeScan.createdAt', 'desc')
                    .limit(1)
                    .as('latestScanResults'),
                jsonArrayFrom(
                    eb
                        .selectFrom('orgDataSourceCodeEnv')
                        .innerJoin('orgDataSource', 'orgDataSource.id', 'orgDataSourceCodeEnv.dataSourceId')
                        .select(['orgDataSource.id', 'orgDataSource.name'])
                        .whereRef('orgDataSourceCodeEnv.codeEnvId', '=', 'orgCodeEnv.id'),
                ).as('dataSources'),
            ])
            .where('orgCodeEnv.orgId', '=', orgId)
            .orderBy('createdAt', 'desc')
            .execute()
    })

const deleteOrgCodeEnvSchema = z.object({
    orgSlug: z.string(),
    codeEnvId: z.string(),
})

export const deleteOrgCodeEnvAction = new Action('deleteOrgCodeEnvAction', { performsMutations: true })
    .params(deleteOrgCodeEnvSchema)
    .middleware(async ({ params: { orgSlug, codeEnvId }, db }) => {
        const codeEnv = await db
            .selectFrom('orgCodeEnv')
            .innerJoin('org', 'org.id', 'orgCodeEnv.orgId')
            .select(['orgCodeEnv.id', 'orgCodeEnv.language', 'orgCodeEnv.isTesting', 'orgCodeEnv.orgId'])
            .where('org.slug', '=', orgSlug)
            .where('orgCodeEnv.id', '=', codeEnvId)
            .executeTakeFirstOrThrow()

        return { ...codeEnv }
    })
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params: { orgSlug }, db, session, ...codeEnv }) => {
        // Captured before the row is destroyed.
        const priorCodeEnv = await priorCodeEnvFor(db, codeEnv.id)

        if (!codeEnv.isTesting) {
            await assertLanguageKeepsUsableCodeEnv(db, codeEnv, 'delete')
        }

        const linkedDataSources = await db
            .selectFrom('orgDataSourceCodeEnv')
            .select(({ fn }) => [fn.count<number>('dataSourceId').as('count')])
            .where('codeEnvId', '=', codeEnv.id)
            .executeTakeFirstOrThrow()

        if (Number(linkedDataSources.count) > 0) {
            throw new ActionFailure(
                'Cannot delete this code environment because it has linked data sources. Remove or re-assign them first.',
            )
        }

        await deleteFolderContents(pathForStarterCodePrefix({ orgSlug, codeEnvId: codeEnv.id }))

        await db
            .deleteFrom('orgCodeEnv')
            .where('orgCodeEnv.id', '=', codeEnv.id)
            .executeTakeFirstOrThrow(throwNotFound(`Failed to delete code environment with id ${codeEnv.id}`))

        // The audit row outlives the record (audit.recordId has no FK), so the name is
        // denormalized into metadata.
        await onCodeEnvDeleted({
            db,
            codeEnvId: codeEnv.id,
            userId: session.user.id,
            changes: diffFields(priorCodeEnv, {}, AUDITED_CODE_ENV_FIELDS),
            name: priorCodeEnv.name,
        })

        revalidatePath(Routes.adminSettings({ orgSlug }))
    })

const fetchCodeEnvHistorySchema = z.object({
    orgSlug: z.string(),
    codeEnvId: z.string(),
})

export const fetchCodeEnvHistoryAction = new Action('fetchCodeEnvHistoryAction')
    .params(fetchCodeEnvHistorySchema)
    .middleware(codeEnvFromOrgAndId)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ codeEnv, db }) => {
        return await db
            .selectFrom('audit')
            // audit.userId has no FK because entries outlive deleted users; an inner join would
            // drop exactly the history an audit trail exists to preserve.
            .leftJoin('user', 'user.id', 'audit.userId')
            .select([
                'audit.id',
                'audit.createdAt',
                'audit.eventType',
                'audit.userId',
                'audit.metadata',
                'user.fullName as userFullName',
            ])
            .where('audit.recordType', '=', 'CODE_ENV')
            // Audit has no org column, so trusting params.codeEnvId here would expose other
            // orgs' history.
            .where('audit.recordId', '=', codeEnv.id)
            .orderBy('audit.createdAt', 'desc')
            // v7 ids are time-ordered, so they break ties within a single clock tick.
            .orderBy('audit.id', 'desc')
            .execute()
    })

const fetchStarterCodeSchema = z.object({
    orgSlug: z.string(),
    codeEnvId: z.string(),
    fileName: z.string(),
})

// Admin console's editor view; the researcher-facing download is getStarterCodeUrlAction.
export const fetchStarterCodeAction = new Action('fetchStarterCodeAction')
    .params(fetchStarterCodeSchema)
    .middleware(codeEnvFromOrgAndId)
    .requireAbilityTo('view', 'OrgConfig')
    .handler(async ({ codeEnv, params: { fileName } }) => {
        if (!codeEnv.starterCodeFileNames.includes(fileName)) {
            throw new ActionFailure(`Starter code file "${fileName}" not found`)
        }
        const path = pathForStarterCode({ orgSlug: codeEnv.orgSlug, codeEnvId: codeEnv.id, fileName })
        const blob = await fetchFileContents(path)
        const content = await blob.text()
        return { content, path, fileName }
    })

const getStarterCodeUploadUrlSchema = z.object({
    orgSlug: z.string(),
    codeEnvId: z.string(),
})

export const getStarterCodeUploadUrlAction = new Action('getStarterCodeUploadUrlAction')
    .params(getStarterCodeUploadUrlSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params: { orgSlug, codeEnvId } }) => {
        const prefix = pathForStarterCodePrefix({ orgSlug, codeEnvId })
        return await createSignedUploadUrl(prefix)
    })
