'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'

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
