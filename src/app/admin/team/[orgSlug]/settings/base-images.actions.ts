'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { throwNotFound } from '@/lib/errors'
import { Action } from '@/server/actions/action'

import { orgBaseImageSchema } from './base-images.schema'
import { orgIdFromSlug } from '@/server/db/queries'

const actionSchema = orgBaseImageSchema.extend({
    orgSlug: z.string(),
})

export const createOrgBaseImageAction = new Action('createOrgBaseImageAction')
    .params(actionSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params: input, orgId, db }) => {
        const newBaseImage = await db
            .insertInto('orgBaseImage')
            .values({
                orgId: orgId,
                name: input.name,
                cmdLine: input.cmdLine,
                language: input.language,
                url: input.url,
                isTesting: input.isTesting,
            })
            .returningAll()
            .executeTakeFirstOrThrow(throwNotFound(`Failed to create new image`))

        // Revalidate the page to show the new image immediately
        revalidatePath(`/admin/team/${input.orgSlug}/settings`)

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
