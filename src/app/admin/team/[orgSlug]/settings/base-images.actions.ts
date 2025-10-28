'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { throwNotFound } from '@/lib/errors'
import { s3BucketName, getS3Client, storeS3File, deleteS3File } from '@/server/aws'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { pathForStarterCode } from '@/lib/paths'

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

    const starterCodePath = pathForStarterCode(orgSlug, starterCode.name)

        const newBaseImage = await db
            .insertInto('orgBaseImage')
            .values({
                orgId,
                ...fieldValues,
                starterCodePath,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await storeS3File({ orgSlug }, starterCode.stream(), starterCodePath )

        revalidatePath(`/admin/team/${orgSlug}/settings`)

        return newBaseImage
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

export const deleteOrgBaseImageAction = new Action('deleteOrgBaseImageAction')
    .params(deleteOrgBaseImageSchema)
    .middleware(async ({ params: { orgSlug, imageId }, db }) => {

    const baseImage = await db
        .selectFrom('orgBaseImage')
        .innerJoin('org', 'org.id', 'orgBaseImage.orgId')
        .select(['orgBaseImage.id', 'orgBaseImage.starterCodePath'])
        .where('org.slug', '=', orgSlug)
        .where('orgBaseImage.id', '=', imageId)
        .executeTakeFirstOrThrow()

    return { baseImage }
})

    .requireAbilityTo('update', 'Org')
    .handler(async ({ baseImage, params: { orgSlug }, db }) => {


    await deleteS3File(baseImage.starterCodePath)


    await db
        .deleteFrom('orgBaseImage')
        .where('orgBaseImage.id', '=', baseImage.id)
        .executeTakeFirstOrThrow(throwNotFound(`Failed to delete base image with id ${baseImage.id}`))

        revalidatePath(`/admin/team/${orgSlug}/settings`)
    })
