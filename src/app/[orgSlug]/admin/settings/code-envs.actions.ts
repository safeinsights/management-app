'use server'

import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { throwNotFound } from '@/lib/errors'
import { storeS3File, deleteS3File } from '@/server/aws'
import { pathForStarterCode } from '@/lib/paths'
import { fetchFileContents } from '@/server/storage'
import type { DB } from '@/database/types'
import type { Kysely } from 'kysely'
import { Routes } from '@/lib/routes'

const codeEnvFromOrgAndId = async ({
    params: { orgSlug, imageId },
    db,
}: {
    params: { orgSlug: string; imageId: string }
    db: Kysely<DB>
}) => {
    const codeEnv = await db
        .selectFrom('orgCodeEnv')
        .innerJoin('org', 'org.id', 'orgCodeEnv.orgId')
        .select(['orgCodeEnv.id', 'orgCodeEnv.starterCodePath', 'org.id as orgId']) // orgId is needed for permissions check
        .where('org.slug', '=', orgSlug)
        .where('orgCodeEnv.id', '=', imageId)
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
    starterCode: z.instanceof(File),
    isTesting: z.boolean().default(false),
    settings: codeEnvSettingsSchema.optional().default({ environment: [] }),
})

export const createOrgCodeEnvAction = new Action('createOrgCodeEnvAction', { performsMutations: true })
    .params(createOrgCodeEnvSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, orgId, db }) => {
        const { orgSlug, starterCode, ...fieldValues } = params

        const id = uuidv7()

        const starterCodePath = pathForStarterCode({
            orgSlug,
            codeEnvId: id,
            fileName: starterCode.name,
        })
        await storeS3File({ orgSlug }, starterCode.stream(), starterCodePath)

        const newCodeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                id,
                orgId,
                ...fieldValues,
                settings: fieldValues.settings,
                starterCodePath,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        revalidatePath(Routes.adminSettings({ orgSlug }))

        return newCodeEnv
    })

const updateOrgCodeEnvSchema = z.object({
    orgSlug: z.string(),
    imageId: z.string(),
    name: z.string(),
    language: z.enum(['R', 'PYTHON']),
    cmdLine: z.string(),
    url: z.string(),
    starterCode: z.instanceof(File).optional(),
    isTesting: z.boolean().default(false),
    settings: codeEnvSettingsSchema.optional().default({ environment: [] }),
})

export const updateOrgCodeEnvAction = new Action('updateOrgCodeEnvAction', { performsMutations: true })
    .params(updateOrgCodeEnvSchema)
    .middleware(async (args) => ({ ...(await codeEnvFromOrgAndId(args)).codeEnv }))
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, starterCodePath, db }) => {
        const { orgSlug, imageId, starterCode, ...fieldValues } = params

        if (starterCode && starterCode.size > 0) {
            const newStarterCodePath = pathForStarterCode({
                orgSlug,
                codeEnvId: imageId,
                fileName: starterCode.name,
            })
            await storeS3File({ orgSlug }, starterCode.stream(), newStarterCodePath)
            await deleteS3File(starterCodePath)
            starterCodePath = newStarterCodePath
        }

        const updatedCodeEnv = await db
            .updateTable('orgCodeEnv')
            .set({
                ...fieldValues,
                settings: fieldValues.settings,
                starterCodePath,
            })
            .where('id', '=', imageId)
            .returningAll()
            .executeTakeFirstOrThrow()

        revalidatePath(Routes.adminSettings({ orgSlug }))

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
            .where('orgCodeEnv.orgId', '=', orgId)
            .orderBy('createdAt', 'desc')
            .execute()
    })

const deleteOrgCodeEnvSchema = z.object({
    orgSlug: z.string(),
    imageId: z.string(),
})

export const deleteOrgCodeEnvAction = new Action('deleteOrgCodeEnvAction', { performsMutations: true })
    .params(deleteOrgCodeEnvSchema)
    .middleware(async ({ params: { orgSlug, imageId }, db }) => {
        const codeEnv = await db
            .selectFrom('orgCodeEnv')
            .innerJoin('org', 'org.id', 'orgCodeEnv.orgId')
            .select([
                'orgCodeEnv.id',
                'orgCodeEnv.starterCodePath',
                'orgCodeEnv.language',
                'orgCodeEnv.isTesting',
                'orgCodeEnv.orgId',
            ])
            .where('org.slug', '=', orgSlug)
            .where('orgCodeEnv.id', '=', imageId)
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

        await db
            .deleteFrom('orgCodeEnv')
            .where('orgCodeEnv.id', '=', codeEnv.id)
            .executeTakeFirstOrThrow(throwNotFound(`Failed to delete code environment with id ${codeEnv.id}`))

        revalidatePath(Routes.adminSettings({ orgSlug }))
    })

const fetchStarterCodeSchema = z.object({
    orgSlug: z.string(),
    imageId: z.string(),
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
