'use server'

import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { throwNotFound } from '@/lib/errors'
import {
    deleteS3File,
    deleteFolderContents,
    moveFolderContents,
    createSignedUploadUrl,
    triggerScanForCodeEnv,
} from '@/server/aws'
import { pathForStarterCode, pathForStarterCodePrefix, pathForSampleData } from '@/lib/paths'
import { sanitizeFileName } from '@/lib/utils'
import { SAMPLE_DATA_FORMATS, type SampleDataFormat } from '@/lib/types'
import { fetchFileContents } from '@/server/storage'
import { SIMULATE_CODE_BUILD } from '@/server/config'
import logger from '@/lib/logger'
import type { DB } from '@/database/types'
import type { Kysely } from 'kysely'
import { Routes } from '@/lib/routes'

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
            'orgCodeEnv.starterCodePath',
            'orgCodeEnv.sampleDataPath',
            'orgCodeEnv.url',
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
    language: z.enum(['R', 'PYTHON']),
    cmdLine: z.string(),
    url: z.string(),
    starterCodeFileName: z.string(),
    isTesting: z.boolean().default(false),
    settings: codeEnvSettingsSchema.optional().default({ environment: [] }),
    sampleDataPath: z.string().optional(),
    sampleDataUploaded: z.boolean().optional(),
    sampleDataFormat: z
        .enum(Object.keys(SAMPLE_DATA_FORMATS) as [SampleDataFormat, ...SampleDataFormat[]])
        .nullable()
        .optional(),
})

export const createOrgCodeEnvAction = new Action('createOrgCodeEnvAction', { performsMutations: true })
    .params(createOrgCodeEnvSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, orgId, db }) => {
        const { orgSlug, starterCodeFileName, sampleDataPath, sampleDataUploaded, ...fieldValues } = params

        const id = uuidv7()

        const starterCodePath = pathForStarterCode({
            orgSlug,
            codeEnvId: id,
            fileName: starterCodeFileName,
        })

        const newCodeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                id,
                orgId,
                ...fieldValues,
                settings: fieldValues.settings,
                starterCodePath,
                sampleDataPath: sampleDataPath ? sanitizeFileName(sampleDataPath) : null,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        revalidatePath(Routes.adminSettings({ orgSlug }))

        if (!SIMULATE_CODE_BUILD) {
            await db.insertInto('scan').values({ codeEnvId: newCodeEnv.id, status: 'SCAN-PENDING' }).execute()

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
    language: z.enum(['R', 'PYTHON']),
    cmdLine: z.string(),
    url: z.string(),
    starterCodeFileName: z.string().optional(),
    starterCodeUploaded: z.boolean().optional(),
    isTesting: z.boolean().default(false),
    settings: codeEnvSettingsSchema.optional().default({ environment: [] }),
    sampleDataPath: z.string().optional(),
    sampleDataUploaded: z.boolean().optional(),
    sampleDataFormat: z
        .enum(Object.keys(SAMPLE_DATA_FORMATS) as [SampleDataFormat, ...SampleDataFormat[]])
        .nullable()
        .optional(),
})

export const updateOrgCodeEnvAction = new Action('updateOrgCodeEnvAction', { performsMutations: true })
    .params(updateOrgCodeEnvSchema)
    .middleware(async (args) => ({ ...(await codeEnvFromOrgAndId(args)).codeEnv }))
    .requireAbilityTo('update', 'Org')
    // existingSampleDataPath comes from the DB query in middleware (codeEnvFromOrgAndId), not from client params
    .handler(async ({ params, starterCodePath, sampleDataPath: existingSampleDataPath, url: existingUrl, db }) => {
        const {
            orgSlug,
            codeEnvId,
            starterCodeFileName,
            starterCodeUploaded,
            sampleDataPath,
            sampleDataUploaded,
            ...fieldValues
        } = params

        if (starterCodeUploaded && starterCodeFileName) {
            const newStarterCodePath = pathForStarterCode({
                orgSlug,
                codeEnvId,
                fileName: starterCodeFileName,
            })
            await deleteFolderContents(pathForStarterCodePrefix({ orgSlug, codeEnvId }))
            starterCodePath = newStarterCodePath
        }

        const sanitizedSampleDataPath = sampleDataPath ? sanitizeFileName(sampleDataPath) : null

        if (sampleDataUploaded && existingSampleDataPath) {
            await deleteFolderContents(pathForSampleData({ orgSlug, codeEnvId }))
        } else if (
            sanitizedSampleDataPath &&
            existingSampleDataPath &&
            sanitizedSampleDataPath !== existingSampleDataPath
        ) {
            const codeEnvInfo = { orgSlug, codeEnvId }
            await moveFolderContents(
                pathForSampleData({ ...codeEnvInfo, sampleDataPath: existingSampleDataPath }),
                pathForSampleData({ ...codeEnvInfo, sampleDataPath: sanitizedSampleDataPath }),
            )
        }

        const updatedCodeEnv = await db
            .updateTable('orgCodeEnv')
            .set({
                ...fieldValues,
                settings: fieldValues.settings,
                starterCodePath,
                sampleDataPath: sanitizedSampleDataPath,
            })
            .where('id', '=', codeEnvId)
            .returningAll()
            .executeTakeFirstOrThrow()

        revalidatePath(Routes.adminSettings({ orgSlug }))

        if (!SIMULATE_CODE_BUILD && updatedCodeEnv.url !== existingUrl) {
            await db.insertInto('scan').values({ codeEnvId: updatedCodeEnv.id, status: 'SCAN-PENDING' }).execute()

            triggerScanForCodeEnv({ codeEnvId: updatedCodeEnv.id, imageUrl: updatedCodeEnv.url }).catch((err) =>
                logger.error('Failed to trigger scan for updated code env', err, { codeEnvId: updatedCodeEnv.id }),
            )
        }

        return updatedCodeEnv
    })

const fetchOrgCodeEnvsSchema = z.object({
    orgSlug: z.string(),
})

export const fetchOrgCodeEnvsAction = new Action('fetchOrgCodeEnvsAction')
    .params(fetchOrgCodeEnvsSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'Org')
    .handler(async ({ orgId, db }) => {
        return await db
            .selectFrom('orgCodeEnv')
            .selectAll('orgCodeEnv')
            .select((eb) => [
                eb
                    .selectFrom('scan')
                    .select('scan.status')
                    .whereRef('scan.codeEnvId', '=', 'orgCodeEnv.id')
                    .orderBy('scan.createdAt', 'desc')
                    .limit(1)
                    .as('latestScanStatus'),
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
            .select([
                'orgCodeEnv.id',
                'orgCodeEnv.starterCodePath',
                'orgCodeEnv.sampleDataPath',
                'orgCodeEnv.language',
                'orgCodeEnv.isTesting',
                'orgCodeEnv.orgId',
            ])
            .where('org.slug', '=', orgSlug)
            .where('orgCodeEnv.id', '=', codeEnvId)
            .executeTakeFirstOrThrow()

        return codeEnv
    })
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params: { orgSlug }, db, ...codeEnv }) => {
        if (!codeEnv.isTesting) {
            const nonTestingForLanguage = await db
                .selectFrom('orgCodeEnv')
                .select(({ fn }) => [fn.count<number>('id').as('count')])
                .where('orgId', '=', codeEnv.orgId)
                .where('language', '=', codeEnv.language)
                .where('isTesting', '=', false)
                .where('id', '!=', codeEnv.id)
                .executeTakeFirstOrThrow()

            if (Number(nonTestingForLanguage.count) === 0) {
                throw new Error(
                    `Cannot delete the last non-testing ${codeEnv.language} code environment. At least one non-testing code environment must exist for each language.`,
                )
            }
        }

        await deleteS3File(codeEnv.starterCodePath)
        await deleteFolderContents(pathForSampleData({ orgSlug, codeEnvId: codeEnv.id }))

        await db
            .deleteFrom('orgCodeEnv')
            .where('orgCodeEnv.id', '=', codeEnv.id)
            .executeTakeFirstOrThrow(throwNotFound(`Failed to delete code environment with id ${codeEnv.id}`))

        revalidatePath(Routes.adminSettings({ orgSlug }))
    })

const fetchStarterCodeSchema = z.object({
    orgSlug: z.string(),
    codeEnvId: z.string(),
})

export const fetchStarterCodeAction = new Action('fetchStarterCodeAction')
    .params(fetchStarterCodeSchema)
    .middleware(codeEnvFromOrgAndId)
    .requireAbilityTo('view', 'Org')
    .handler(async ({ codeEnv }) => {
        const blob = await fetchFileContents(codeEnv.starterCodePath)
        const content = await blob.text()
        return { content, path: codeEnv.starterCodePath }
    })

const getSampleDataUploadUrlSchema = z.object({
    codeEnvId: z.string(),
})

const codeEnvFromId = async ({ params: { codeEnvId }, db }: { params: { codeEnvId: string }; db: Kysely<DB> }) => {
    const codeEnv = await db
        .selectFrom('orgCodeEnv')
        .innerJoin('org', 'org.id', 'orgCodeEnv.orgId')
        .select(['orgCodeEnv.id', 'orgCodeEnv.sampleDataPath', 'org.slug as orgSlug', 'org.id as orgId'])
        .where('orgCodeEnv.id', '=', codeEnvId)
        .executeTakeFirstOrThrow()

    return { codeEnv, orgId: codeEnv.orgId }
}

export const getSampleDataUploadUrlAction = new Action('getSampleDataUploadUrlAction')
    .params(getSampleDataUploadUrlSchema)
    .middleware(codeEnvFromId)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ codeEnv }) => {
        const prefix = pathForSampleData({
            orgSlug: codeEnv.orgSlug,
            codeEnvId: codeEnv.id,
            sampleDataPath: codeEnv.sampleDataPath ?? undefined,
        })
        return await createSignedUploadUrl(prefix)
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
