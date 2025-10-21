'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { throwNotFound } from '@/lib/errors'
import { Action, ActionFailure } from '@/server/actions/action'

import { orgBaseImageSchema } from './base-images.schema'
import { orgIdFromSlug } from '@/server/db/queries'

const actionSchema = z.object({
    orgSlug: z.string(),
    formData: z.instanceof(FormData),
})

export const createOrgBaseImageAction = new Action('createOrgBaseImageAction')
    .params(actionSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, orgId, db }) => {
        const { formData, orgSlug } = params

        const rawData = {
            name: formData.get('name') as string,
            cmdLine: formData.get('cmdLine') as string,
            language: formData.get('language') as 'R' | 'Python',
            url: formData.get('url') as string,
            isTesting: formData.get('isTesting') === 'true',
        }

        const validationResult = orgBaseImageSchema.safeParse(rawData)
        if (!validationResult.success) {
            throw new ActionFailure({
                message: 'Validation failed',
                errors: JSON.stringify(validationResult.error.flatten()),
            })
        }

        const { name, cmdLine, language, url, isTesting } = validationResult.data
        const skeletonCodeFile = formData.get('skeletonCode') as File | null

        // TODO: Handle file upload to S3 and get the URL.
        const skeletonCodeUrl = skeletonCodeFile ? `https://example.com/skeletons/${skeletonCodeFile.name}` : null

        const newBaseImage = await db
            .insertInto('orgBaseImage')
            .values({
                orgId: orgId,
                name,
                cmdLine,
                language,
                url,
                isTesting,
                skeletonCodeUrl,
            })
            .returningAll()
            .executeTakeFirstOrThrow(throwNotFound(`Failed to create new image`))

        // Revalidate the page to show the new image immediately
        revalidatePath(`/admin/team/${orgSlug}/settings`)

        return newBaseImage
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
        await db
            .deleteFrom('orgBaseImage')
            .where('orgBaseImage.orgId', '=', orgId)
            .where('orgBaseImage.id', '=', imageId)
            .executeTakeFirstOrThrow(throwNotFound(`Failed to delete base image with id ${imageId}`))

        revalidatePath(`/admin/team/${orgSlug}/settings`)
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
