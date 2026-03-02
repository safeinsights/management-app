'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { OrgBreadcrumbs, ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { Stack, Title } from '@mantine/core'
import { redirect } from 'next/navigation'
import { AgreementsPage } from './agreements-page'

export default async function StudyAgreementsRoute(props: { params: Promise<{ orgSlug: string; studyId: string }> }) {
    const { orgSlug, studyId } = await props.params

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
        const codeSubmitted = study.jobStatusChanges.some(
            (s) => s.status === 'CODE-SUBMITTED' || s.status === 'CODE-SCANNED',
        )
        if (!codeSubmitted) {
            redirect(Routes.studyReview({ orgSlug, studyId }))
        }

        return (
            <Stack p="xl" gap="xl">
                <OrgBreadcrumbs crumbs={{ orgSlug, current: 'Agreements' }} />
                <Title order={1}>Study request</Title>
                <AgreementsPage
                    isReviewer
                    proceedHref={Routes.studyReview({ orgSlug, studyId })}
                    // TODO: update previousHref when card 393 is implemented
                    previousHref={Routes.orgDashboard({ orgSlug })}
                />
            </Stack>
        )
    }

    const hasJobActivity = study.jobStatusChanges.length > 0
    if (study.status !== 'APPROVED' && !hasJobActivity) {
        redirect(Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId }))
    }
    const proceedHref = hasJobActivity
        ? Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId })
        : Routes.studyCode({ orgSlug: study.submittedByOrgSlug, studyId })
    const proceedLabel = hasJobActivity ? 'Back to Study Details' : undefined

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs crumbs={{ orgSlug, studyId, current: 'Agreements' }} />
            <Title order={1}>Study request</Title>
            <AgreementsPage
                isReviewer={false}
                proceedHref={proceedHref}
                proceedLabel={proceedLabel}
                previousHref={
                    hasJobActivity
                        ? Routes.orgDashboard({ orgSlug: study.submittedByOrgSlug })
                        : Routes.studyEdit({ orgSlug: study.submittedByOrgSlug, studyId })
                }
            />
        </Stack>
    )
}
