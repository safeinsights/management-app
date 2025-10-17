'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { throwNotFound } from '@/lib/errors'
import { getS3Client, s3BucketName, signedUrlForFile, storeS3File } from '@/server/aws'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'

const starterCodeSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    language: z.enum(['r', 'python']),
    file: z.instanceof(File),
})

const actionSchema = starterCodeSchema.extend({
    orgSlug: z.string(),
})

export const createStarterCodeAction = new Action('createStarterCodeAction')
    .params(actionSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params: input, orgId, db }) => {
        const file = input.file
        const fileName = file.name

        // create S3 path for the starter code file
        const s3Path = `starter-code/${orgId}/${crypto.randomUUID()}-${fileName}`

        // upload file to S3
        const fileStream = file.stream()
        const uploadInfo = {
            orgId,
            orgSlug: input.orgSlug,
            studyId: 'starter-code',
        }
        await storeS3File(uploadInfo, fileStream, s3Path)

        const fileUrl = `s3://${s3BucketName()}/${s3Path}`

        const newStarterCode = await db
            .insertInto('orgStarterCode')
            .values({
                orgId: orgId,
                name: input.name,
                language: input.language,
                fileName: fileName,
                url: fileUrl,
            })
            .returningAll()
            .executeTakeFirstOrThrow(throwNotFound('Failed to create starter code'))

        revalidatePath(`/admin/team/${input.orgSlug}/settings`)

        return newStarterCode
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

        return { url: downloadUrl, fileName: starterCode.fileName }
    })
