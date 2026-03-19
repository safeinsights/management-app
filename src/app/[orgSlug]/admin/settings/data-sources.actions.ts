'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { jsonArrayFrom } from '@/database'
import { throwNotFound } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { createOrgDataSourceSchema, editOrgDataSourceSchema } from './data-sources.schema'

const fetchOrgDataSourcesSchema = z.object({
    orgSlug: z.string(),
})

export const fetchOrgDataSourcesAction = new Action('fetchOrgDataSourcesAction')
    .params(fetchOrgDataSourcesSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'Org')
    .handler(async ({ orgId, db }) => {
        return await db
            .selectFrom('orgDataSource')
            .select((eb) => [
                'orgDataSource.id',
                'orgDataSource.name',
                'orgDataSource.description',
                'orgDataSource.documentationUrl',
                'orgDataSource.orgId',
                'orgDataSource.createdAt',
                jsonArrayFrom(
                    eb
                        .selectFrom('orgDataSourceCodeEnv')
                        .innerJoin('orgCodeEnv', 'orgCodeEnv.id', 'orgDataSourceCodeEnv.codeEnvId')
                        .select(['orgCodeEnv.id', 'orgCodeEnv.name'])
                        .whereRef('orgDataSourceCodeEnv.dataSourceId', '=', 'orgDataSource.id'),
                ).as('codeEnvs'),
            ])
            .where('orgDataSource.orgId', '=', orgId)
            .orderBy('orgDataSource.createdAt', 'desc')
            .execute()
    })

const createSchema = z.object({
    orgSlug: z.string(),
    ...createOrgDataSourceSchema.shape,
})

export const createOrgDataSourceAction = new Action('createOrgDataSourceAction', { performsMutations: true })
    .params(createSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, orgId, db }) => {
        const { orgSlug, name, description, documentationUrl } = params

        const result = await db
            .insertInto('orgDataSource')
            .values({
                orgId,
                name,
                description: description || null,
                documentationUrl: documentationUrl || null,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        revalidatePath(Routes.adminSettings({ orgSlug }))

        return result
    })

const updateSchema = z.object({
    orgSlug: z.string(),
    dataSourceId: z.string(),
    ...editOrgDataSourceSchema.shape,
})

export const updateOrgDataSourceAction = new Action('updateOrgDataSourceAction', { performsMutations: true })
    .params(updateSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, orgId, db }) => {
        const { orgSlug, dataSourceId, name, description, documentationUrl } = params

        const result = await db
            .updateTable('orgDataSource')
            .set({
                name,
                description: description || null,
                documentationUrl: documentationUrl || null,
            })
            .where('id', '=', dataSourceId)
            .where('orgId', '=', orgId)
            .returningAll()
            .executeTakeFirstOrThrow(throwNotFound(`Data source with id ${dataSourceId}`))

        revalidatePath(Routes.adminSettings({ orgSlug }))

        return result
    })

const deleteSchema = z.object({
    orgSlug: z.string(),
    dataSourceId: z.string(),
})

export const deleteOrgDataSourceAction = new Action('deleteOrgDataSourceAction', { performsMutations: true })
    .params(deleteSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, orgId, db }) => {
        const { orgSlug, dataSourceId } = params

        await db
            .deleteFrom('orgDataSource')
            .where('id', '=', dataSourceId)
            .where('orgId', '=', orgId)
            .executeTakeFirstOrThrow(throwNotFound(`Data source with id ${dataSourceId}`))

        revalidatePath(Routes.adminSettings({ orgSlug }))
    })
