'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { throwNotFound } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { createOrgDataSourceSchema, editOrgDataSourceSchema } from './data-sources.schema'
import type { Kysely } from 'kysely'
import type { DB } from '@/database/types'

const orgIdFromSlugWithCodeEnv = async ({
    params: { orgSlug, codeEnvId },
    db,
}: {
    params: { orgSlug: string; codeEnvId: string }
    db: Kysely<DB>
}) => {
    const org = await db
        .selectFrom('org')
        .select(['id as orgId', 'type as orgType'])
        .where('slug', '=', orgSlug)
        .executeTakeFirst()

    await db
        .selectFrom('orgCodeEnv')
        .select('id')
        .where('id', '=', codeEnvId)
        .where('orgId', '=', org?.orgId ?? '')
        .executeTakeFirstOrThrow(throwNotFound(`Code environment ${codeEnvId}`))

    return org
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
            .innerJoin('orgCodeEnv', 'orgCodeEnv.id', 'orgDataSource.codeEnvId')
            .select([
                'orgDataSource.id',
                'orgDataSource.name',
                'orgDataSource.description',
                'orgDataSource.documentationUrl',
                'orgDataSource.orgId',
                'orgDataSource.codeEnvId',
                'orgDataSource.createdAt',
                'orgCodeEnv.name as codeEnvName',
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
    .middleware(orgIdFromSlugWithCodeEnv)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, orgId, db }) => {
        const { orgSlug, name, description, documentationUrl, codeEnvId } = params

        const result = await db
            .insertInto('orgDataSource')
            .values({
                orgId,
                codeEnvId,
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
    .middleware(orgIdFromSlugWithCodeEnv)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params, orgId, db }) => {
        const { orgSlug, dataSourceId, name, description, documentationUrl, codeEnvId } = params

        const result = await db
            .updateTable('orgDataSource')
            .set({
                name,
                description: description || null,
                documentationUrl: documentationUrl || null,
                codeEnvId,
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
