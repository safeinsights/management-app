'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { OrgBreadcrumbs, ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { db } from '@/database'
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
        const statuses = study.jobStatusChanges.map((s) => s.status)
        const codeSubmitted = statuses.includes('CODE-SUBMITTED')
        const codeReviewed = statuses.includes('CODE-APPROVED') || statuses.includes('CODE-REJECTED')

        // Skip agreements if code hasn't been submitted or has already been reviewed
        if (!codeSubmitted || codeReviewed) {
            redirect(Routes.studyReview({ orgSlug, studyId }))
        }

        // Skip agreements on resubmission — reviewer has already seen them
        const jobCount = await db
            .selectFrom('studyJob')
            .where('studyId', '=', studyId)
            .select(db.fn.countAll().as('count'))
            .executeTakeFirstOrThrow()
        if (Number(jobCount.count) > 1) {
            redirect(Routes.studyReview({ orgSlug, studyId }))
        }

        return (
            <Stack p="xl" gap="xl">
                <OrgBreadcrumbs crumbs={{ orgSlug, current: 'Agreements' }} />
                <Title order={1}>Study request</Title>
                <AgreementsPage
                    isReviewer
                    proceedHref={`${Routes.studyReview({ orgSlug, studyId })}?from=agreements-proceed`}
                    previousHref={`${Routes.studyReview({ orgSlug, studyId })}?from=agreements`}
                    previousLabel="Previous"
                />
            </Stack>
        )
    }

    // Baseline jobs (IDE launch / file upload) don't count — only actual submissions
    const hasJobActivity = study.jobStatusChanges.some((s) => s.status === 'CODE-SUBMITTED')
    if (study.status !== 'APPROVED' && !hasJobActivity) {
        redirect(Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId }))
    }
    const proceedHref = hasJobActivity
        ? Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId })
        : Routes.studyCode({ orgSlug: study.submittedByOrgSlug, studyId })
    const proceedLabel = hasJobActivity ? 'Back to Study Details' : undefined
    const previousHref = hasJobActivity
        ? Routes.orgDashboard({ orgSlug: study.submittedByOrgSlug })
        : `${Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId })}?from=agreements`
    const previousLabel = hasJobActivity ? undefined : 'Previous'

    const dashboardHref = searchParams.returnTo === 'org' ? Routes.orgDashboard({ orgSlug }) : Routes.dashboard

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs crumbs={{ orgSlug, studyId, current: 'Agreements', dashboardHref }} />
            <Title order={1}>Study request</Title>
            <AgreementsPage
                isReviewer={false}
                proceedHref={proceedHref}
                proceedLabel={proceedLabel}
                previousHref={previousHref}
                previousLabel={previousLabel}
            />
        </Stack>
    )
}
