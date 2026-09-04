import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { displayOrgName } from '@/lib/string'
import { redirect } from 'next/navigation'
import { OrgLegalView } from './org-legal-view'
import { OrgLegalTabs } from './org-legal-tabs'

export default async function OrgLegalPage({ params }: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await params

    const org = await getOrgFromSlugAction({ orgSlug })

    if (isActionError(org)) {
        redirect(Routes.notFound)
    }

    return (
        <OrgLegalView
            orgName={displayOrgName(org.name)}
            tabs={<OrgLegalTabs orgSlug={org.slug} orgType={org.type} />}
        />
    )
}
