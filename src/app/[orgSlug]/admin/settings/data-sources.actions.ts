'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { jsonArrayFrom } from '@/database'
import { throwNotFound } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { createOrgDataSourceSchema, editOrgDataSourceSchema } from './data-sources.schema'

type DataSourceDocDetails = {
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
                        .selectFrom('orgDataSourceDocument')
                        .select([
                            'orgDataSourceDocument.id',
                            'orgDataSourceDocument.url',
                            'orgDataSourceDocument.description',
                        ])
                        .whereRef('orgDataSourceDocument.orgDataSourceId', '=', 'orgDataSource.id')
                        .orderBy('orgDataSourceDocument.createdAt', 'asc'),
                ).as('documents'),
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
        const { orgSlug, name, description, documents } = params

        const dataSource = await db
            .insertInto('orgDataSource')
            .values({
                orgId,
                name,
                description: description || null,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const docRows = documents.map((d) => ({
            ...d,
            orgDataSourceId: dataSource.id,
        }))

        const dataSourceDocuments: DataSourceDocDetails[] = []

        if (docRows.length > 0) {
            const data = await db
                .insertInto('orgDataSourceDocument')
                .values(docRows)
                .returning(['id', 'url', 'description'])
                .execute()
            dataSourceDocuments.push(...data)
        }

        revalidatePath(Routes.adminSettings({ orgSlug }))

        return { ...dataSource, documents: dataSourceDocuments }
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
        const { orgSlug, dataSourceId, name, description, documents } = params

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

        // Query existing docs for this source before updating / creating / deleting
        const existingDocs = await db
            .selectFrom('orgDataSourceDocument')
            .select(['id'])
            .where('orgDataSourceId', '=', dataSourceId)
            .execute()

        const docsToUpdate = documents.filter((d): d is typeof d & { id: string } => !!d.id)
        const docsToCreate = documents.filter((d) => !d.id)
        const docsToUpdateIds = docsToUpdate.map((d) => d.id)
        const docsToDelete = existingDocs.filter((d) => !docsToUpdateIds.includes(d.id))

        const dataSourceDocResults: DataSourceDocDetails[] = []

        // Update existing docs
        for (const doc of docsToUpdate) {
            const updatedDoc = await db
                .updateTable('orgDataSourceDocument')
                .set({
                    url: doc.url,
                    description: doc.description,
                })
                .where('id', '=', doc.id)
                .returning(['id', 'url', 'description'])
                .executeTakeFirstOrThrow(throwNotFound(`Data source document with id ${doc.id}`))

            dataSourceDocResults.push(updatedDoc)
        }

        // Delete docs that are no longer associated with the data source
        for (const doc of docsToDelete) {
            await db.deleteFrom('orgDataSourceDocument').where('id', '=', doc.id).execute()
        }

        // Create new docs if needed
        const newDocRows = docsToCreate.map((d) => ({
            ...d,
            orgDataSourceId: dataSourceId,
        }))

        if (newDocRows.length > 0) {
            const data = await db
                .insertInto('orgDataSourceDocument')
                .values(newDocRows)
                .returning(['id', 'url', 'description'])
                .execute()

            dataSourceDocResults.push(...data)
        }

        revalidatePath(Routes.adminSettings({ orgSlug }))

        return { ...updatedDataSource, documents: dataSourceDocResults }
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
