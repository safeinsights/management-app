import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getOrgNameFromId, latestJobForStudyOrNull } from '@/server/db/queries'
import { StudyDetails } from '@/components/study/study-details'
import { getCodeReviewFeedbackAction, getStudyAction } from '@/server/actions/study.actions'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { Routes } from '@/lib/routes'
import { isActionError } from '@/lib/errors'
import { actionResult } from '@/lib/utils'
import { isStudyResultsStatus } from '@/lib/study-job-status'
import { isSubmittedStudy } from '@/schema/study'
import { notFound } from 'next/navigation'
import type { StudyJobStatus } from '@/database/types'
import { CodeOnlyView } from './code-only-view'
import { CodePostDecisionView } from './code-post-decision-view'
import { isCodeDecisionStatus } from './code-decision-status'
import { CodePostSubmissionView } from './code-post-submission-view'
import { ResearcherProposalView } from './researcher-proposal-view'
import { StudyDetailsResearcher } from './study-details-researcher'

const CODE_UNDER_REVIEW_STATUSES: readonly StudyJobStatus[] = ['CODE-SUBMITTED', 'CODE-SCANNED']

const isUnderReviewStatus = (status: StudyJobStatus | undefined): boolean =>
    !!status && CODE_UNDER_REVIEW_STATUSES.includes(status)

export default async function StudyReviewPage(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
    searchParams: Promise<Record<string, string | undefined>>
}) {
    const { studyId, orgSlug } = await props.params
    const searchParams = await props.searchParams

    const study = actionResult(await getStudyAction({ studyId }))

    const job = await latestJobForStudyOrNull(studyId)

    const dashboardHref = searchParams.returnTo === 'org' ? Routes.orgDashboard({ orgSlug }) : Routes.dashboard

    const fromAgreements = searchParams.from === 'agreements'
    const fromCodeSubmission = searchParams.from === 'code-submission'

    // Only show code views if code was actually submitted (not just a baseline job from IDE launch).
    // When the researcher navigates back from agreements (?from=agreements), show the read-only
    // proposal view instead so they can reach the proposal even after submitting code.
    const codeSubmitted = job?.statusChanges.some((s) => s.status === 'CODE-SUBMITTED')
    if (job && codeSubmitted && !fromAgreements) {
        const latestJobStatus = job.statusChanges[0]?.status
        const isUnderReview = study.status === 'PENDING-REVIEW' && isUnderReviewStatus(latestJobStatus)

        // RL "Previous" from the results-stage Study Details page returns here with ?from=code-submission.
        // Once results exist the under-review branch no longer fires, so render the OTTER-537 post-submission
        // page explicitly. The "code under review" banner is hidden because review has already concluded.
        if (fromCodeSubmission) {
            const reviewingOrgName = await getOrgNameFromId(study.orgId)
            return (
                <CodePostSubmissionView
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    reviewingOrgName={reviewingOrgName}
                    dashboardHref={dashboardHref}
                    isUnderReview={false}
                />
            )
        }

        if (isCodeDecisionStatus(latestJobStatus)) {
            const entries = await getCodeReviewFeedbackAction({ studyId })
            if (isActionError(entries) || entries.length === 0) {
                return <CodeOnlyView orgSlug={orgSlug} study={study} job={job} dashboardHref={dashboardHref} />
            }
            // A code decision implies the study was submitted long ago — this branch
            // should be unreachable for DRAFTs. Guard explicitly so the narrowed view
            // type holds and a corrupt row can't surface a runtime error in render.
            if (!isSubmittedStudy(study)) {
                notFound()
            }
            const reviewingOrgName = await getOrgNameFromId(study.orgId)
            return (
                <CodePostDecisionView
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    entries={entries}
                    reviewingOrgName={reviewingOrgName}
                    dashboardHref={dashboardHref}
                    latestJobStatus={latestJobStatus}
                />
            )
        }

        if (isUnderReview) {
            const reviewingOrgName = await getOrgNameFromId(study.orgId)
            return (
                <CodePostSubmissionView
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    reviewingOrgName={reviewingOrgName}
                    dashboardHref={dashboardHref}
                />
            )
        }
        // OTTER-538: once results exist, render the redesigned Study Details page
        // (no code section, results-only) instead of the legacy CodeOnlyView.
        if (isStudyResultsStatus(latestJobStatus)) {
            return <StudyDetailsResearcher orgSlug={orgSlug} study={study} job={job} dashboardHref={dashboardHref} />
        }
        return <CodeOnlyView orgSlug={orgSlug} study={study} job={job} dashboardHref={dashboardHref} />
    }

    const showProposalView =
        study.status === 'REJECTED' ||
        study.status === 'APPROVED' ||
        study.status === 'CHANGE-REQUESTED' ||
        codeSubmitted
    if (showProposalView) {
        const agreementsHref = fromAgreements
            ? Routes.studyAgreements({
                  orgSlug,
                  studyId,
                  returnTo: searchParams.returnTo === 'org' ? 'org' : undefined,
              })
            : undefined
        return (
            <ResearcherProposalView
                orgSlug={orgSlug}
                study={study}
                agreementsHref={agreementsHref}
                dashboardHref={dashboardHref}
            />
        )
    }

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId,
                    orgSlug,
                    current: 'Study Details',
                    dashboardHref,
                }}
            />
            <Title order={1}>Study Details</Title>
            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center" wrap="nowrap">
                        <Title order={4} size="xl" style={{ flex: 1, minWidth: 0 }}>
                            Study Proposal
                        </Title>
                        <StudyApprovalStatus status={study.status} date={study.approvedAt ?? study.rejectedAt} />
                    </Group>
                    <StudyDetails study={study} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Code
                        </Title>
                    </Group>
                    <Divider c="dimmed" />
                    <Text c="dimmed">No code has been uploaded yet.</Text>
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Status
                        </Title>
                    </Group>
                    <Divider c="dimmed" />
                    <Text c="dimmed">Status will be available after code is uploaded.</Text>
                </Stack>
            </Paper>
        </Stack>
    )
}
