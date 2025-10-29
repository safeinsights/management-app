'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { throwNotFound } from '@/lib/errors'
import { storeS3File, deleteS3File } from '@/server/aws'
import { pathForStarterCode } from '@/lib/paths'
import { fetchFileContents } from '@/server/storage'
import type { DB } from '@/database/types'
import type { Kysely } from 'kysely'
import { randomString } from '@/lib/string'
import { Routes } from '@/lib/routes'

// Common middleware to fetch base image with org validation
const baseImageFromOrgAndId = async ({
    params: { orgSlug, imageId },
    db,
}: {
    params: { orgSlug: string; imageId: string }
    db: Kysely<DB>
}) => {
    const baseImage = await db
        .selectFrom('orgBaseImage')
        .innerJoin('org', 'org.id', 'orgBaseImage.orgId')
        .select(['orgBaseImage.id', 'orgBaseImage.starterCodePath'])
        .where('org.slug', '=', orgSlug)
        .where('orgBaseImage.id', '=', imageId)
        .executeTakeFirstOrThrow()

    return { baseImage }
}

const createOrgBaseImageSchema = z.object({
    orgSlug: z.string(),
    name: z.string(),
    language: z.enum(['R', 'PYTHON']),
    cmdLine: z.string(),
    url: z.string(),
    starterCode: z.instanceof(File),
    isTesting: z.boolean().default(false),
})

export const createOrgBaseImageAction = new Action('createOrgBaseImageAction', { performsMutations: true })
    .params(createOrgBaseImageSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, orgId, db }) => {
        const { orgSlug, starterCode, ...fieldValues } = params
        const starterCodePath = pathForStarterCode({ orgSlug, fileName: `${randomString(12)}-${starterCode.name}` })
        const newBaseImage = await db
            .insertInto('orgBaseImage')
            .values({
                orgId,
                ...fieldValues,
                starterCodePath,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await storeS3File({ orgSlug }, starterCode.stream(), starterCodePath)

        revalidatePath(Routes.adminSettings({ orgSlug }))

        return newBaseImage
    })

const updateOrgBaseImageSchema = z.object({
    orgSlug: z.string(),
    imageId: z.string(),
    name: z.string(),
    language: z.enum(['R', 'PYTHON']),
    cmdLine: z.string(),
    url: z.string(),
    starterCode: z.instanceof(File).optional(),
    isTesting: z.boolean().default(false),
})

export const updateOrgBaseImageAction = new Action('updateOrgBaseImageAction', { performsMutations: true })
    .params(updateOrgBaseImageSchema)
    .middleware(baseImageFromOrgAndId)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, baseImage, db }) => {
        const { orgSlug, imageId, starterCode, ...fieldValues } = params

        let starterCodePath = baseImage.starterCodePath

        // If a new starter code file is provided, upload it and delete the old one
        if (starterCode && starterCode.size > 0) {
            const newStarterCodePath = pathForStarterCode({
                orgSlug,
                fileName: `${randomString(12)}-${starterCode.name}`,
            })
            await storeS3File({ orgSlug }, starterCode.stream(), newStarterCodePath)
            await deleteS3File(baseImage.starterCodePath)
            starterCodePath = newStarterCodePath
        }

        const updatedBaseImage = await db
            .updateTable('orgBaseImage')
            .set({
                ...fieldValues,
                starterCodePath,
            })
            .where('id', '=', imageId)
            .returningAll()
            .executeTakeFirstOrThrow()

        revalidatePath(Routes.adminSettings({ orgSlug }))

        return updatedBaseImage
    })

const fetchOrgBaseImagesSchema = z.object({
    orgSlug: z.string(),
})

export const fetchOrgBaseImagesAction = new Action('fetchOrgBaseImagesAction')
    .params(fetchOrgBaseImagesSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'Org')
    .handler(async ({ orgId, db }) => {
        return await db
            .selectFrom('orgBaseImage')
            .selectAll('orgBaseImage')
            .where('orgBaseImage.orgId', '=', orgId)
            .execute()
    })

const deleteOrgBaseImageSchema = z.object({
    orgSlug: z.string(),
    imageId: z.string(),
})

export const deleteOrgBaseImageAction = new Action('deleteOrgBaseImageAction', { performsMutations: true })
    .params(deleteOrgBaseImageSchema)
    .middleware(async ({ params: { orgSlug, imageId }, db }) => {
        const baseImage = await db
            .selectFrom('orgBaseImage')
            .innerJoin('org', 'org.id', 'orgBaseImage.orgId')
            .select([
                'orgBaseImage.id',
                'orgBaseImage.starterCodePath',
                'orgBaseImage.language',
                'orgBaseImage.isTesting',
                'orgBaseImage.orgId',
            ])
            .where('org.slug', '=', orgSlug)
            .where('orgBaseImage.id', '=', imageId)
            .executeTakeFirstOrThrow()

        return { baseImage }
    })
    .requireAbilityTo('update', 'Org')
    .handler(async ({ baseImage, params: { orgSlug }, db }) => {
        // If deleting a non-testing image, ensure there's at least one other non-testing image for that language
        if (!baseImage.isTesting) {
            const nonTestingImagesForLanguage = await db
                .selectFrom('orgBaseImage')
                .select(({ fn }) => [fn.count<number>('id').as('count')])
                .where('orgId', '=', baseImage.orgId)
                .where('language', '=', baseImage.language)
                .where('isTesting', '=', false)
                .where('id', '!=', baseImage.id) // Exclude the image being deleted
                .executeTakeFirstOrThrow()

            // Convert count to number for comparison (Kysely may return it as string)
            if (Number(nonTestingImagesForLanguage.count) === 0) {
                throw new Error(
                    `Cannot delete the last non-testing ${baseImage.language} base image. At least one non-testing image must exist for each language.`,
                )
            }
        }

        await deleteS3File(baseImage.starterCodePath)

        await db
            .deleteFrom('orgBaseImage')
            .where('orgBaseImage.id', '=', baseImage.id)
            .executeTakeFirstOrThrow(throwNotFound(`Failed to delete base image with id ${baseImage.id}`))

        revalidatePath(Routes.adminSettings({ orgSlug }))
    })

const fetchStarterCodeSchema = z.object({
    orgSlug: z.string(),
    imageId: z.string(),
})

export const fetchStarterCodeAction = new Action('fetchStarterCodeAction')
    .params(fetchStarterCodeSchema)
    .middleware(baseImageFromOrgAndId)
    .requireAbilityTo('view', 'Org')
    .handler(async ({ baseImage }) => {
        const blob = await fetchFileContents(baseImage.starterCodePath)
        const content = await blob.text()
        return { content, path: baseImage.starterCodePath }
    })
