'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { throwNotFound } from '@/lib/errors'
import { s3BucketName, getS3Client, signedUrlForFile } from '@/server/aws'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { pathForStarterCode, s3UrlForStarterCode } from '@/lib/paths'

const createStarterCodeSchema = z.object({
    orgSlug: z.string(),
    name: z.string(),
    language: z.enum(['r', 'python']),
    starterCode: z.instanceof(File),
})

export const createStarterCodeAction = new Action('createStarterCodeAction', { performsMutations: true })
    .params(createStarterCodeSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, orgId, db }) => {
        const { name, language, starterCode, orgSlug } = params

        // create base image record first
        const newBaseImage = await db
            .insertInto('orgBaseImage')
            .values({
                orgId: orgId,
                name,
                language: language.toUpperCase() as 'R' | 'PYTHON',
                cmdLine: '',
                baseImageUrl: '',
                isTesting: false,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const s3Key = pathForStarterCode(orgId, newBaseImage.id)

        // upload to S3
        const fileBuffer = Buffer.from(await starterCode.arrayBuffer())
        await getS3Client().send(
            new PutObjectCommand({
                Bucket: s3BucketName(),
                Key: s3Key,
                Body: fileBuffer,
                ContentType: starterCode.type,
            }),
        )

        const updated = await db
            .updateTable('orgBaseImage')
            .set({ skeletonCodeUrl: s3UrlForStarterCode(orgId, newBaseImage.id, s3BucketName()) })
            .where('id', '=', newBaseImage.id)
            .returningAll()
            .executeTakeFirstOrThrow()

        revalidatePath(`/admin/team/${orgSlug}/settings`)

        return updated
    })

const fetchStarterCodesSchema = z.object({
    orgSlug: z.string(),
})

export const fetchStarterCodesAction = new Action('fetchStarterCodesAction')
    .params(fetchStarterCodesSchema)
    .middleware(async ({ params, db }) => {
        const starterCodes = await db
            .selectFrom('orgBaseImage')
            .innerJoin('org', (join) =>
                join.onRef('org.id', '=', 'orgBaseImage.orgId').on('org.slug', '=', params.orgSlug),
            )
            .selectAll('orgBaseImage')
            .where('orgBaseImage.skeletonCodeUrl', 'is not', null)
            .execute()

        return { starterCodes }
    })
    .requireAbilityTo('view', 'Org')
    .handler(async ({ starterCodes }) => {
        return starterCodes
    })

const deleteStarterCodeSchema = z.object({
    orgSlug: z.string(),
    id: z.string(),
})

export const deleteStarterCodeAction = new Action('deleteStarterCodeAction', { performsMutations: true })
    .params(deleteStarterCodeSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ orgId, params: { id, orgSlug }, db }) => {
        const baseImage = await db
            .selectFrom('orgBaseImage')
            .selectAll('orgBaseImage')
            .where('orgBaseImage.orgId', '=', orgId)
            .where('orgBaseImage.id', '=', id)
            .executeTakeFirst()
        if (!baseImage?.skeletonCodeUrl) {
            throw throwNotFound(`Starter code with id ${id} not found`)
        }

        await db
            .deleteFrom('orgBaseImage')
            .where('orgBaseImage.orgId', '=', orgId)
            .where('orgBaseImage.id', '=', id)
            .executeTakeFirstOrThrow(throwNotFound(`Failed to delete starter code with id ${id}`))

        revalidatePath(`/admin/team/${orgSlug}/settings`)
    })

const downloadStarterCodeSchema = z.object({
    orgSlug: z.string(),
    id: z.string(),
})

export const downloadStarterCodeAction = new Action('downloadStarterCodeAction')
    .params(downloadStarterCodeSchema)
    .middleware(async ({ params, db }) => {
        const baseImage = await db
            .selectFrom('orgBaseImage')
            .innerJoin('org', (join) =>
                join.onRef('org.id', '=', 'orgBaseImage.orgId').on('org.slug', '=', params.orgSlug),
            )
            .selectAll('orgBaseImage')
            .where('orgBaseImage.id', '=', params.id)
            .where('orgBaseImage.skeletonCodeUrl', 'is not', null)
            .executeTakeFirst()

        if (!baseImage) {
            throw throwNotFound(`Starter code with id ${params.id} not found`)
        }

        return { baseImage, orgId: baseImage.orgId }
    })
    .requireAbilityTo('view', 'Org')
    .handler(async ({ params: { id }, baseImage, orgId }) => {
        const s3Key = pathForStarterCode(orgId, id)

        const downloadUrl = await signedUrlForFile(s3Key)

        return { url: downloadUrl, fileName: baseImage.name }
    })
