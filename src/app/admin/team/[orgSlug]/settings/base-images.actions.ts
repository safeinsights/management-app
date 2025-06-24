'use server'

import { db } from '@/database'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { orgAdminAction } from '@/server/actions/wrappers'
import { throwNotFound } from '@/lib/errors'

import { orgBaseImageSchema } from './base-images.schema'

const actionSchema = orgBaseImageSchema.extend({
    orgSlug: z.string(),
})

export const createOrgBaseImageAction = orgAdminAction(async (input) => {
    const newBaseImage = await db
        .insertInto('orgBaseImage')
        .columns(['orgId', 'name', 'cmdLine', 'language', 'url', 'isTesting'])
        .expression((eb) =>
            eb
                .selectFrom('org')
                .select([
                    'id',
                    eb.val(input.name).as('name'),
                    eb.val(input.cmdLine).as('cmdLine'),
                    eb.val(input.language).as('lang'),
                    eb.val(input.url).as('url'),
                    eb.val(input.isTesting).as('isTesting'),
                ])
                .where('slug', '=', input.orgSlug),
        )
        .returningAll()
        .executeTakeFirstOrThrow(throwNotFound(`Failed to create new image`))

    // Revalidate the page to show the new image immediately
    revalidatePath(`/admin/team/${input.orgSlug}/settings`)

    return newBaseImage
}, actionSchema)

const deleteOrgBaseImageSchema = z.object({
    orgSlug: z.string(),
    imageId: z.string(),
})

export const deleteOrgBaseImageAction = orgAdminAction(async ({ imageId, orgSlug }) => {
    await db
        .deleteFrom('orgBaseImage')
        .using('org')
        .whereRef('org.id', '=', 'orgBaseImage.orgId')
        .where('org.slug', '=', orgSlug)
        .where('orgBaseImage.id', '=', imageId)
        .executeTakeFirstOrThrow(throwNotFound(`Failed to delete base image with id ${imageId}`))

    revalidatePath(`/admin/team/${orgSlug}/settings`)
}, deleteOrgBaseImageSchema)

const fetchOrgBaseImagesSchema = z.object({
    orgSlug: z.string(),
})
export const fetchOrgBaseImagesAction = orgAdminAction(async ({ orgSlug }) => {
    return await db
        .selectFrom('orgBaseImage')
        .selectAll('orgBaseImage')
        .innerJoin('org', 'org.id', 'orgBaseImage.orgId')
        .where('org.slug', '=', orgSlug)
        .execute()
}, fetchOrgBaseImagesSchema)
