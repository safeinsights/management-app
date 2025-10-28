'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { throwNotFound } from '@/lib/errors'
import { s3BucketName, getS3Client } from '@/server/aws'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'

const createOrgBaseImageSchema = z.object({
    orgSlug: z.string(),
    name: z.string(),
    language: z.enum(['r', 'python']),
    cmdLine: z.string(),
    baseImageUrl: z.string(),
    isTesting: z.boolean().default(false),
})

export const createOrgBaseImageAction = new Action('createOrgBaseImageAction')
    .params(createOrgBaseImageSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, orgId, db }) => {
        const { name, language, cmdLine, baseImageUrl, isTesting, orgSlug } = params

        const newBaseImage = await db
            .insertInto('orgBaseImage')
            .values({
                orgId: orgId,
                name,
                language: language.toUpperCase() as 'R' | 'PYTHON',
                cmdLine,
                baseImageUrl,
                isTesting,
                skeletonCodeUrl: null,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

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
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ orgId, params: { imageId, orgSlug }, db }) => {
        const baseImage = await db
            .selectFrom('orgBaseImage')
            .selectAll('orgBaseImage')
            .where('orgBaseImage.orgId', '=', orgId)
            .where('orgBaseImage.id', '=', imageId)
            .executeTakeFirst()

        if (baseImage && baseImage.skeletonCodeUrl) {
            const s3Key = baseImage.skeletonCodeUrl.replace(`s3://${s3BucketName()}/`, '')

            try {
                await getS3Client().send(
                    new DeleteObjectCommand({
                        Bucket: s3BucketName(),
                        Key: s3Key,
                    }),
                )
            } catch (error) {
                console.error(`Failed to delete S3 file: ${s3Key}`, error)
            }
        }

        await db
            .deleteFrom('orgBaseImage')
            .where('orgBaseImage.orgId', '=', orgId)
            .where('orgBaseImage.id', '=', imageId)
            .executeTakeFirstOrThrow(throwNotFound(`Failed to delete base image with id ${imageId}`))

        revalidatePath(`/admin/team/${orgSlug}/settings`)
    })
