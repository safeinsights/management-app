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

    // Allow direct access when navigating back via Previous button
    const isDirectAccess = searchParams.from === 'previous'

    if (isReviewer) {
        // Once the reviewer has acknowledged agreements, skip straight to review
        // (unless they navigated back here intentionally)
        if (study.reviewerAgreementsAckedAt && !isDirectAccess) {
            redirect(Routes.studyReview({ orgSlug, studyId }))
        }

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
                    proceedHref={`${Routes.studyReview({ orgSlug, studyId })}?from=agreements-proceed`}
                    previousHref={`${Routes.studyReview({ orgSlug, studyId })}?from=agreements`}
                    previousLabel="Previous"
                />
            </Stack>
        )
    }

    // Researcher flow — skip if already acknowledged (unless navigating back)
    if (study.researcherAgreementsAckedAt && !isDirectAccess) {
        const hasJobActivity = study.jobStatusChanges.length > 0
        const dest = hasJobActivity
            ? Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId })
            : Routes.studyCode({ orgSlug: study.submittedByOrgSlug, studyId })
        redirect(dest)
    }

    if (study.status !== 'APPROVED' && !isDirectAccess) {
        redirect(Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId }))
    }

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs crumbs={{ orgSlug, studyId, current: 'Agreements' }} />
            <Title order={1}>Study request</Title>
            <AgreementsPage
                isReviewer={false}
                studyId={studyId}
                proceedHref={Routes.studyCode({ orgSlug: study.submittedByOrgSlug, studyId })}
                previousHref={`${Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId })}?from=agreements`}
                previousLabel="Previous"
            />
        </Stack>
    )
}
