'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { isSubmittedStudy } from '@/schema/study'
import { getStudyAction } from '@/server/actions/study.actions'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { sessionFromClerk } from '@/server/clerk'
import { ReviewerProposalFeedbackScreen } from '../../_screens/reviewer-proposal-feedback-screen'

export default async function ReviewProposalPage(props: { params: Promise<{ orgSlug: string; studyId: string }> }) {
    const { orgSlug, studyId } = await props.params
    const session = await sessionFromClerk()
    const currentOrg = session?.orgs[orgSlug]
    if (!session || !currentOrg) return <AccessDeniedAlert />

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study || !isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const raw = await rawStudyStateForStudy(studyId)
    if (!raw) return <AlertNotFound title="Study was not found" message="No such study exists" />

    return (await ReviewerProposalFeedbackScreen({
        descriptor: { screen: 'reviewer-proposal-feedback' },
        study,
        raw,
        orgSlug,
        dashboardHref: Routes.orgDashboard({ orgSlug }),
    })) as React.JSX.Element
}
