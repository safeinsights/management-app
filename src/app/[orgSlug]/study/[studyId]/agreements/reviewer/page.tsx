'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { isActionError } from '@/lib/errors'
import { toRecord } from '@/lib/permissions'
import { Routes } from '@/lib/routes'
import { studyHasJobStatus } from '@/lib/studies'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { Stack } from '@mantine/core'
import { redirect } from 'next/navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { AgreementsPage } from '../agreements-page'

// Reviewer agreements step. Gated on the review ability, not org membership, so an SI admin (who can
// review any org's studies) follows this flow. A dual-role user reaches it only via the reviewing
// org's slug; their researcher entry point is /agreements/researcher.
export default async function ReviewerAgreementsRoute(props: {
    params: Promise<{ orgSlug: string; studyId: string }>
}) {
    const { orgSlug, studyId } = await props.params

    const session = await sessionFromClerk()
    if (!session) {
        return <AccessDeniedAlert />
    }

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    if (!session.can('review', toRecord('Study', { orgId: study.orgId }))) {
        return <AccessDeniedAlert />
    }

    // No code submitted yet — nothing to review, show proposal instead
    const codeSubmitted = studyHasJobStatus(study, 'CODE-SUBMITTED')
    if (!codeSubmitted) {
        redirect(Routes.studyReview({ orgSlug, studyId }))
    }

    // Mirror ReviewerAgreementsScreen: Proceed acks and re-resolves bare /review to the code-review
    // editor. OTTER-643: Previous walks back to the decided proposal (/review/proposal). Pointing it at
    // /review would re-resolve to reviewer-code-review, whose own Previous comes back here — an
    // agreements ⇄ code-review loop.
    return (
        <Stack p="xl" gap="xxl">
            <OrgBreadcrumbs crumbs={{ orgSlug, current: 'Agreements' }} />
            <StudyPageHeader>Study request</StudyPageHeader>
            <AgreementsPage
                isReviewer
                studyId={studyId}
                proceedHref={Routes.studyReview({ orgSlug, studyId })}
                previousHref={Routes.studyReviewProposal({ orgSlug, studyId })}
                previousLabel="Previous"
            />
        </Stack>
    )
}
