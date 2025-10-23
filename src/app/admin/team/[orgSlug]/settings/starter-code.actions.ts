'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { throwNotFound } from '@/lib/errors'
import { s3BucketName, getS3Client, signedUrlForFile } from '@/server/aws'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'

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

        // TODO: Handle file upload to S3 and get the URL.
        const fileUrl = `https://example.com/starter-code/${file.name}`

        const newStarterCode = await db
            .insertInto('orgStarterCode')
            .values({
                orgId: orgId,
                name,
                language: language.toUpperCase() as 'R' | 'PYTHON',
                url: fileUrl,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        revalidatePath(`/admin/team/${orgSlug}/settings`)

        return newStarterCode
    })

const fetchStarterCodesSchema = z.object({
    orgSlug: z.string(),
})

export const fetchStarterCodesAction = new Action('fetchStarterCodesAction')
    .params(fetchStarterCodesSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'Org')
    .handler(async ({ orgId, db }) => {
        return await db
            .selectFrom('orgStarterCode')
            .selectAll('orgStarterCode')
            .where('orgStarterCode.orgId', '=', orgId)
            .execute()
    })

const deleteStarterCodeSchema = z.object({
    orgSlug: z.string(),
    id: z.string(),
})
export const deleteStarterCodeAction = new Action('deleteStarterCodeAction')
    .params(deleteStarterCodeSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ orgId, params: { id, orgSlug }, db }) => {
        const starterCode = await db
            .selectFrom('orgStarterCode')
            .selectAll('orgStarterCode')
            .where('orgStarterCode.orgId', '=', orgId)
            .where('orgStarterCode.id', '=', id)
            .executeTakeFirst()

        if (starterCode && starterCode.url.startsWith('s3://')) {
            const s3Key = starterCode.url.replace(`s3://${s3BucketName()}/`, '')

            // delete the file from S3
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
            .deleteFrom('orgStarterCode')
            .where('orgStarterCode.orgId', '=', orgId)
            .where('orgStarterCode.id', '=', id)
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
        const starterCode = await db
            .selectFrom('orgStarterCode')
            .selectAll('orgStarterCode')
            .where('orgStarterCode.orgId', '=', orgId)
            .where('orgStarterCode.id', '=', id)
            .executeTakeFirst()

        if (!starterCode) {
            throw throwNotFound(`Starter code with id ${id} not found`)
        }

        // extract S3 key from URL
        const s3Key = starterCode.url.replace(`s3://${s3BucketName()}/`, '')

        const downloadUrl = await signedUrlForFile(s3Key)

        return { url: downloadUrl, fileName: starterCode.name }
    })
