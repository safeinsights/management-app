'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { OrgBreadcrumbs, ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { isActionError } from '@/lib/errors'
import { toRecord } from '@/lib/permissions'
import { Routes } from '@/lib/routes'
import { studyHasJobStatus } from '@/lib/studies'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { Stack, Title } from '@mantine/core'
import { redirect } from 'next/navigation'
import { AgreementsPage } from './agreements-page'

export default async function StudyAgreementsRoute(props: {
    params: Promise<{ orgSlug: string; studyId: string }>
    searchParams: Promise<Record<string, string | undefined>>
}) {
    const { orgSlug, studyId } = await props.params
    const searchParams = await props.searchParams

    const session = await sessionFromClerk()
    if (!session) {
        return <AccessDeniedAlert />
    }

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    // Access: the user must be able to review (as the enclave) or view (as the submitting lab).
    const canReview = session.can('review', toRecord('Study', { orgId: study.orgId }))
    const canView = session.can('view', toRecord('Study', { submittedByOrgId: study.submittedByOrgId }))
    if (!canReview && !canView) {
        return <AccessDeniedAlert />
    }

    // A single account can hold BOTH roles — researcher (lab) and reviewer (enclave) — e.g.
    // single-user testing or SI admins. Review ability alone then can't say which flow the user is
    // in, and treating them as a reviewer bounced a dual-role researcher — browsing under their own
    // lab slug — into the DO /review view (OTTER-614). When the lab and enclave are genuinely
    // distinct orgs, the URL scope decides: the submitting-lab slug is the researcher flow. When
    // they collapse to one org (e.g. single-org fixtures), fall back to review ability. Mirrors the
    // lab-vs-enclave check in researcher-profile/page.tsx.
    const inResearcherScope = study.orgId !== study.submittedByOrgId && orgSlug === study.submittedByOrgSlug
    const isReviewer = canReview && !inResearcherScope

    if (isReviewer) {
        // No code submitted yet — nothing to review, show proposal instead
        const codeSubmitted = studyHasJobStatus(study, 'CODE-SUBMITTED')
        if (!codeSubmitted) {
            redirect(Routes.studyReview({ orgSlug, studyId }))
        }

        // Mirror ReviewerAgreementsScreen: Proceed acks and re-resolves bare /review to the code-review
        // editor; Previous returns to the dashboard. Pointing Previous at /review would re-resolve to
        // reviewer-code-review, whose own Previous comes back here — an agreements ⇄ code-review loop.
        return (
            <Stack p="xl" gap="xl">
                <OrgBreadcrumbs crumbs={{ orgSlug, current: 'Agreements' }} />
                <Title order={1}>Study request</Title>
                <AgreementsPage
                    isReviewer
                    studyId={studyId}
                    proceedHref={Routes.studyReview({ orgSlug, studyId })}
                    previousHref={Routes.orgDashboard({ orgSlug })}
                    previousLabel="Previous"
                />
            </Stack>
        )
    }

    // Researcher flow: /agreements is a revisitable step. An authorized researcher can view it
    // directly — forward or back — even after acknowledging, so it no longer self-redirects. The
    // screen authority (resolveScreen on /view) decides the canonical screen.
    const returnTo = searchParams.returnTo === 'org' ? 'org' : undefined

    // OTTER-614: Previous → the read-only initial-request screen (/view?step=proposal), the current
    // Cruising Fin proposal page with its own "Proceed to Step 3" forward path back here — not the
    // legacy /submitted page. ?step=proposal pins the view's first step so an advanced study does
    // not re-resolve forward to code/results.
    const previousHref = Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId, returnTo, step: 'proposal' })

    // OTTER-614: once code is submitted, Proceed lands on the read-only code screen
    // (/view?step=code), NOT the editable upload page — the researcher must not edit code at this
    // stage. Before submission it still targets the upload page for the first-time code upload.
    const codeSubmitted = studyHasJobStatus(study, 'CODE-SUBMITTED')
    const proceedHref = codeSubmitted
        ? Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId, returnTo, step: 'code' })
        : Routes.studyCode({ orgSlug: study.submittedByOrgSlug, studyId })

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs crumbs={{ orgSlug, studyId, current: 'Agreements' }} />
            <Title order={1}>Study request</Title>
            <AgreementsPage
                isReviewer={false}
                studyId={studyId}
                proceedHref={proceedHref}
                previousHref={previousHref}
                previousLabel="Previous"
            />
        </Stack>
    )
}
