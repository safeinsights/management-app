'use server'

import type { Metadata } from 'next'
import { AccessDeniedAlert } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { isLabOrg } from '@/lib/types'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'
import { StudyProposal } from './proposal'

export async function generateMetadata(): Promise<Metadata> {
    return { title: 'Set up study' }
}

export default async function RequestStudyPage(props: { params: Promise<{ orgSlug: string }> }) {
    const session = await sessionFromClerk()
    if (!session) return <AccessDeniedAlert />

    const { orgSlug } = await props.params

    // No study row exists yet, so the header takes its eyebrow from the route org, which is the lab
    // the researcher is creating for (OTTER-619).
    const org = await getOrgFromSlugAction({ orgSlug })
    if (isActionError(org)) {
        redirect(Routes.notFound)
    }

    // No study exists yet, so the route org is the persona: a Data Partner slug is never a submitting lab.
    if (!isLabOrg(org)) {
        redirect(Routes.orgDashboard({ orgSlug }))
    }

    return <StudyProposal submittingLabName={org.name} />
}
