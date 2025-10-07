'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'

const starterCodeSchema = z.object({
    orgSlug: z.string(),
    name: z.string(),
    language: z.enum(['r', 'python']),
    file: z.instanceof(File),
})

export const createStarterCodeAction = new Action('createStarterCodeAction')
    .params(starterCodeSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('update', 'Org')
    .handler(async ({ params: input, orgId, db }) => {
        // TODO: Implement file upload to S3

        // TODO: Save starter code to the database
        const newStarterCode = {
            id: '1',
            orgId: orgId,
            name: input.name,
            language: input.language,
            fileName: input.file.name,
            url: 'https://example.com/file',
        }

        // Revalidate the page to show the new starter code immediately
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
    .handler(async ({ params: { orgSlug } }) => {
        // TODO: Delete starter code from the database
        // TODO: Delete file from S3

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
        // TODO: Fetch starter codes from the database
        return []
    })
