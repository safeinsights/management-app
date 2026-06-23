'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { OrgBreadcrumbs, ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { isActionError } from '@/lib/errors'
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
    const currentOrg = session?.orgs[orgSlug]
    if (!session || !currentOrg) {
        return <AccessDeniedAlert />
    }

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    const isReviewer = currentOrg.type === 'enclave'

    if (isReviewer) {
        // No code submitted yet — nothing to review, show proposal instead
        const codeSubmitted = studyHasJobStatus(study, 'CODE-SUBMITTED')
        if (!codeSubmitted) {
            redirect(Routes.studyReview({ orgSlug, studyId }))
        }

        return (
            <Stack p="xl" gap="xl">
                <OrgBreadcrumbs crumbs={{ orgSlug, current: 'Agreements' }} />
                <Title order={1}>Study request</Title>
                <AgreementsPage
                    isReviewer
                    studyId={studyId}
                    proceedHref={Routes.studyReview({ orgSlug, studyId })}
                    previousHref={Routes.studyReview({ orgSlug, studyId })}
                    previousLabel="Previous"
                />
            </Stack>
        )
    }

    // Researcher flow: /agreements is a revisitable step. An authorized researcher can view it
    // directly — forward or back — even after acknowledging, so it no longer self-redirects. The
    // screen authority (resolveScreen on /view) decides the canonical screen.
    const returnTo = searchParams.returnTo === 'org' ? 'org' : undefined

    // Previous → /submitted (the approved-proposal page with its own "Proceed to step 3" button),
    // NOT /view. /view re-resolves to proposal-feedback, which has no forward path here, so it would
    // dead-end an approved-no-code researcher (recoverable only via browser back).
    const previousHref = Routes.studySubmitted({ orgSlug: study.submittedByOrgSlug, studyId })

    // OTTER-612: once code is submitted, Proceed lands on /view, which re-resolves to the code-status
    // screen; before submission it targets the upload page.
    const codeSubmitted = studyHasJobStatus(study, 'CODE-SUBMITTED')
    const proceedHref = codeSubmitted
        ? Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId, returnTo })
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
