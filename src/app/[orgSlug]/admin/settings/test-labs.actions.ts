'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Action } from '@/server/actions/action'
import { orgIdFromSlug } from '@/server/db/queries'
import { ActionFailure } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { designateTestLabs, labsEligibleAsTestLabs, orgTestLabs } from '@/server/db/test-lab'
import { designateTestLabsSchema } from './test-labs.schema'

const orgSlugSchema = z.object({ orgSlug: z.string() })

// Only a data partner designates test labs; a lab org reaching this has nothing to answer.
const requireDataPartner = (orgType: string) => {
    if (orgType !== 'enclave') throw new ActionFailure({ org: 'is not a data partner' })
}

export const fetchOrgTestLabsAction = new Action('fetchOrgTestLabsAction')
    .params(orgSlugSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'TestLab')
    .handler(async ({ db, orgId, orgType }) => {
        requireDataPartner(orgType)

        return await orgTestLabs(db, orgId)
    })

export const fetchEligibleTestLabsAction = new Action('fetchEligibleTestLabsAction')
    .params(orgSlugSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('designate', 'TestLab')
    .handler(async ({ db, orgId, orgType }) => {
        requireDataPartner(orgType)

        return await labsEligibleAsTestLabs(db, orgId)
    })

const designateSchema = z.object({ ...orgSlugSchema.shape, ...designateTestLabsSchema.shape })

export const designateTestLabsAction = new Action('designateTestLabsAction', { performsMutations: true })
    .params(designateSchema)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('designate', 'TestLab')
    .handler(async ({ db, orgId, orgType, session, params: { orgSlug, researchLabIds } }) => {
        requireDataPartner(orgType)

        // The ids arrive from the client, so a caller could name an enclave and exempt its own
        // studies from the agreements it is counterparty to.
        const labs = await db
            .selectFrom('org')
            .select('id')
            .where('id', 'in', researchLabIds)
            .where('type', '=', 'lab')
            .execute()

        if (labs.length !== researchLabIds.length) {
            throw new ActionFailure({ researchLabIds: 'must all be research labs' })
        }

        await designateTestLabs(db, { dataPartnerId: orgId, researchLabIds, createdByUserId: session.user.id })

        revalidatePath(Routes.adminSettings({ orgSlug }))
    })
