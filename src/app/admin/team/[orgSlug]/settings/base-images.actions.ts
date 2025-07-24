'use server'

import { db } from '@/database'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { throwNotFound } from '@/lib/errors'
import { Action } from '@/server/actions/action'

import { orgBaseImageSchema } from './base-images.schema'

const actionSchema = orgBaseImageSchema.extend({
    orgSlug: z.string(),
})

export const createOrgBaseImageAction = new Action('createOrgBaseImageAction')
    .params(actionSchema)
    .requireAbilityTo('update', 'Team')
    .handler(async (input, { session }) => {
        const newBaseImage = await db
            .insertInto('orgBaseImage')
            .values({
                orgId: session.team.id,
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
    .requireAbilityTo('update', 'Team')
    .handler(async ({ imageId, orgSlug }) => {
        await db
            .deleteFrom('orgBaseImage')
            .using('org')
            .whereRef('org.id', '=', 'orgBaseImage.orgId')
            .where('org.slug', '=', orgSlug)
            .where('orgBaseImage.id', '=', imageId)
            .executeTakeFirstOrThrow(throwNotFound(`Failed to delete base image with id ${imageId}`))

        revalidatePath(`/admin/team/${orgSlug}/settings`)
    })

const fetchOrgBaseImagesSchema = z.object({
    orgSlug: z.string(),
})
export const fetchOrgBaseImagesAction = new Action('fetchOrgBaseImagesAction')
    .params(fetchOrgBaseImagesSchema)
    .requireAbilityTo('read', 'Team')
    .handler(async ({ orgSlug }) => {
        return await db
            .selectFrom('orgBaseImage')
            .selectAll('orgBaseImage')
            .innerJoin('org', 'org.id', 'orgBaseImage.orgId')
            .where('org.slug', '=', orgSlug)
            .execute()
    })
