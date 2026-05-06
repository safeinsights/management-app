'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { jsonArrayFrom } from '@/database'
import { throwNotFound } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { createOrgDataSourceSchema, editOrgDataSourceSchema } from './data-sources.schema'

type DataSourceUrlDetails = {
    id: string
    url: string | null
    description: string | null
}

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
                'orgDataSource.orgId',
                'orgDataSource.createdAt',
                jsonArrayFrom(
                    eb
                        .selectFrom('orgDataSourceCodeEnv')
                        .innerJoin('orgCodeEnv', 'orgCodeEnv.id', 'orgDataSourceCodeEnv.codeEnvId')
                        .select(['orgCodeEnv.id', 'orgCodeEnv.name'])
                        .whereRef('orgDataSourceCodeEnv.dataSourceId', '=', 'orgDataSource.id'),
                ).as('codeEnvs'),
                jsonArrayFrom(
                    eb
                        .selectFrom('orgDataSourceUrl')
                        .select(['orgDataSourceUrl.id', 'orgDataSourceUrl.url', 'orgDataSourceUrl.description'])
                        .whereRef('orgDataSourceUrl.orgDataSourceId', '=', 'orgDataSource.id')
                        .orderBy('orgDataSourceUrl.createdAt', 'asc'),
                ).as('urls'),
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
        const { orgSlug, name, description, urls } = params

        const dataSource = await db
            .insertInto('orgDataSource')
            .values({
                orgId,
                name,
                description: description || null,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const urlRows = urls.map((u) => ({
            ...u,
            orgDataSourceId: dataSource.id,
        }))

        const dataSourceUrls: DataSourceUrlDetails[] = []

        if (urlRows.length > 0) {
            const data = await db
                .insertInto('orgDataSourceUrl')
                .values(urlRows)
                .returning(['id', 'url', 'description'])
                .execute()
            dataSourceUrls.push(...data)
        }

        revalidatePath(Routes.adminSettings({ orgSlug }))

        return { ...dataSource, urls: dataSourceUrls }
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
        const { orgSlug, dataSourceId, name, description, urls } = params

        const updatedDataSource = await db
            .updateTable('orgDataSource')
            .set({
                name,
                description: description || null,
            })
            .where('id', '=', dataSourceId)
            .where('orgId', '=', orgId)
            .returningAll()
            .executeTakeFirstOrThrow(throwNotFound(`Data source with id ${dataSourceId}`))

        const existingUrls = await db
            .selectFrom('orgDataSourceUrl')
            .select(['id'])
            .where('orgDataSourceId', '=', dataSourceId)
            .execute()

        const urlsToUpdate = urls.filter((u): u is typeof u & { id: string } => !!u.id)
        const urlsToCreate = urls.filter((u) => !u.id)
        const urlsToUpdateIds = urlsToUpdate.map((u) => u.id)
        const urlsToDelete = existingUrls.filter((u) => !urlsToUpdateIds.includes(u.id))

        const dataSourceUrlResults: DataSourceUrlDetails[] = []

        for (const u of urlsToUpdate) {
            const updatedUrl = await db
                .updateTable('orgDataSourceUrl')
                .set({
                    url: u.url,
                    description: u.description,
                })
                .where('id', '=', u.id)
                .returning(['id', 'url', 'description'])
                .executeTakeFirstOrThrow(throwNotFound(`Data source url with id ${u.id}`))

            dataSourceUrlResults.push(updatedUrl)
        }

        if (urlsToDelete.length > 0) {
            await db
                .deleteFrom('orgDataSourceUrl')
                .where(
                    'id',
                    'in',
                    urlsToDelete.map((u) => u.id),
                )
                .execute()
        }

        const newUrlRows = urlsToCreate.map((u) => ({
            ...u,
            orgDataSourceId: dataSourceId,
        }))

        if (newUrlRows.length > 0) {
            const data = await db
                .insertInto('orgDataSourceUrl')
                .values(newUrlRows)
                .returning(['id', 'url', 'description'])
                .execute()

            dataSourceUrlResults.push(...data)
        }

        revalidatePath(Routes.adminSettings({ orgSlug }))

        return { ...updatedDataSource, urls: dataSourceUrlResults }
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
