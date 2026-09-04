'use server'

import { AccessDeniedAlert } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'
import { StudyProposal } from './proposal'

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

    return <StudyProposal submittingLabName={org.name} />
}
