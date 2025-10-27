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
    file: z.instanceof(File),
})

export const createStarterCodeAction = new Action('createStarterCodeAction')
    .params(createStarterCodeSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, orgId, db }) => {
        const { name, language, file, orgSlug } = params

        // create base image record first
        const newBaseImage = await db
            .insertInto('orgBaseImage')
            .values({
                orgId: orgId,
                name,
                language: language.toUpperCase() as 'R' | 'PYTHON',
                cmdLine: '',
                url: '',
                isTesting: false,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const s3Key = pathForStarterCode(orgId, newBaseImage.id)

        // upload to S3
        const fileBuffer = Buffer.from(await file.arrayBuffer())
        await getS3Client().send(
            new PutObjectCommand({
                Bucket: s3BucketName(),
                Key: s3Key,
                Body: fileBuffer,
                ContentType: file.type,
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
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'Org')
    .handler(async ({ orgId, db }) => {
        // Fetch only base images that have skeleton code
        return await db
            .selectFrom('orgBaseImage')
            .selectAll('orgBaseImage')
            .where('orgBaseImage.orgId', '=', orgId)
            .where('orgBaseImage.skeletonCodeUrl', 'is not', null)
            .execute()
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
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'Org')
    .handler(async ({ params: { id }, orgId, db }) => {
        const baseImage = await db
            .selectFrom('orgBaseImage')
            .selectAll('orgBaseImage')
            .where('orgBaseImage.orgId', '=', orgId)
            .where('orgBaseImage.id', '=', id)
            .executeTakeFirst()

        if (!baseImage?.skeletonCodeUrl) {
            throw throwNotFound(`Starter code with id ${id} not found`)
        }

        const s3Key = pathForStarterCode(orgId, id)

        const downloadUrl = await signedUrlForFile(s3Key)

        return { url: downloadUrl, fileName: baseImage.name }
    })
