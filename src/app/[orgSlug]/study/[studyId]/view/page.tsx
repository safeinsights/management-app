import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getOrgNameFromId, latestJobForStudyOrNull } from '@/server/db/queries'
import { StudyDetails } from '@/components/study/study-details'
import { getStudyAction } from '@/server/actions/study.actions'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import type { StudyJobStatus } from '@/database/types'
import { PostCodeSubmissionFeatureFlag, StudyDetailsRedesignFeatureFlag } from '@/components/openstax-feature-flag'
import { CodeOnlyView } from './code-only-view'
import { CodePostSubmissionView } from './code-post-submission-view'
import { ResearcherProposalView } from './researcher-proposal-view'
import { StudyDetailsRedesignView } from './study-details-redesign-view'

const CODE_UNDER_REVIEW_STATUSES: readonly StudyJobStatus[] = ['CODE-SUBMITTED', 'CODE-SCANNED']

const isUnderReviewStatus = (status: StudyJobStatus | undefined): boolean =>
    !!status && CODE_UNDER_REVIEW_STATUSES.includes(status)

// OTTER-538: job statuses for the RL Study Details page — "results under review",
// "results ready", and "results rejected".
const STUDY_DETAILS_JOB_STATUSES: readonly StudyJobStatus[] = [
    'RUN-COMPLETE',
    'FILES-APPROVED',
    'FILES-REJECTED',
    'JOB-ERRORED',
]

const isStudyDetailsStatus = (status: StudyJobStatus | undefined): boolean =>
    !!status && STUDY_DETAILS_JOB_STATUSES.includes(status)

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

    // Only show CodeOnlyView if code was actually submitted (not just a baseline job from IDE launch).
    // When the researcher navigates back from agreements (?from=agreements), show the read-only
    // proposal view instead so they can reach the proposal even after submitting code.
    const codeSubmitted = job?.statusChanges.some((s) => s.status === 'CODE-SUBMITTED')
    if (job && codeSubmitted && !fromAgreements) {
        const latestJobStatus = job.statusChanges[0]?.status
        const isUnderReview = study.status === 'PENDING-REVIEW' && isUnderReviewStatus(latestJobStatus)

        if (isUnderReview) {
            const reviewingOrgName = await getOrgNameFromId(study.orgId)
            return (
                <PostCodeSubmissionFeatureFlag
                    defaultContent={
                        <CodeOnlyView orgSlug={orgSlug} study={study} job={job} dashboardHref={dashboardHref} />
                    }
                    optInContent={
                        <CodePostSubmissionView
                            orgSlug={orgSlug}
                            study={study}
                            job={job}
                            reviewingOrgName={reviewingOrgName}
                            dashboardHref={dashboardHref}
                        />
                    }
                />
            )
        }
        // OTTER-538: once results exist, swap the legacy CodeOnlyView for the
        // redesigned Study Details page (no code section, results-only) when the
        // feature flag is on. Only flag-wrap during the results stage; other
        // job-status branches keep the existing CodeOnlyView.
        if (isStudyDetailsStatus(latestJobStatus)) {
            return (
                <StudyDetailsRedesignFeatureFlag
                    defaultContent={
                        <CodeOnlyView orgSlug={orgSlug} study={study} job={job} dashboardHref={dashboardHref} />
                    }
                    optInContent={
                        <StudyDetailsRedesignView
                            orgSlug={orgSlug}
                            study={study}
                            job={job}
                            dashboardHref={dashboardHref}
                        />
                    }
                />
            )
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
