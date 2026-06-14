import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { countSubmittedJobsForStudy, getOrgNameFromId, latestSubmittedJobForStudy } from '@/server/db/queries'
import { StudyDetails } from '@/components/study/study-details'
import { getCodeReviewFeedbackAction, getStudyAction } from '@/server/actions/study.actions'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { Routes } from '@/lib/routes'
import { isActionError } from '@/lib/errors'
import { actionResult } from '@/lib/utils'
import {
    type CodeDecisionStatus,
    hasJobStatus,
    isCodeUnderReviewStatus,
    isStudyResultsStatus,
    latestSubmittedJobLiveCodeDecisionStatus,
    STUDY_CODE_RUNNING_JOB_STATUSES,
} from '@/lib/study-job-status'
import { isSubmittedStudy } from '@/schema/study'
import { notFound } from 'next/navigation'
import { CodePostDecisionView } from './code-post-decision-view'
import { CodePostSubmissionView } from './code-post-submission-view'
import { ResearcherProposalView } from './researcher-proposal-view'
import { StudyDetailsResearcher } from './study-details-researcher'

export default async function StudyReviewPage(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
    searchParams: Promise<Record<string, string | undefined>>
}) {
    const { studyId, orgSlug } = await props.params
    const searchParams = await props.searchParams

    const study = actionResult(await getStudyAction({ studyId }))

    // Anchor routing on the latest *submitted* job, not the newest job row. A fresh baseline
    // job (IDE launch / file upload, status only INITIATED) can be newer than the reviewed
    // submission and would otherwise mask CODE-SUBMITTED / the code decision, dead-ending the
    // researcher on the proposal/post-submission page after a refresh (OTTER-556).
    const job = await latestSubmittedJobForStudy(studyId)

    const returnTo = searchParams.returnTo === 'org' ? 'org' : undefined
    const dashboardHref = returnTo ? Routes.orgDashboard({ orgSlug }) : Routes.dashboard

    const fromAgreements = searchParams.from === 'agreements'
    const fromCodeDecision = searchParams.from === 'code-decision'

    // Baseline-only jobs are already excluded by latestSubmittedJobForStudy; this confirms the
    // submitted job carries CODE-SUBMITTED before routing into the code views. When the researcher
    // navigates back from agreements (?from=agreements), show the read-only proposal view instead
    // so they can reach the proposal even after submitting code.
    const codeSubmitted = job?.statusChanges.some((s) => s.status === 'CODE-SUBMITTED')
    if (job && codeSubmitted && !fromAgreements) {
        const latestJobStatus = job.statusChanges[0]?.status

        // Effective code-decision status for the redesigned decision page. The execution window
        // (JOB-PROVISIONING/PACKAGING/READY/RUNNING) and an approved-but-late CODE-SCANNED both
        // resolve to CODE-APPROVED, keeping the researcher on the Code-approved page until results exist.
        const liveDecisionStatus = latestSubmittedJobLiveCodeDecisionStatus(job.statusChanges)
        const decisionStatus: CodeDecisionStatus | null = hasJobStatus(job.statusChanges, [
            'CODE-APPROVED',
            ...STUDY_CODE_RUNNING_JOB_STATUSES,
        ])
            ? 'CODE-APPROVED'
            : liveDecisionStatus

        // OTTER-612: ?from=code-decision renders the Code-approved page at a results status
        // (otherwise unroutable because the results branch below would take precedence).
        if (isStudyResultsStatus(latestJobStatus) && fromCodeDecision) {
            if (!isSubmittedStudy(study)) {
                notFound()
            }
            const entriesResult = await getCodeReviewFeedbackAction({ studyId })
            const feedbackLoadError = isActionError(entriesResult)
            const entries = feedbackLoadError ? [] : entriesResult
            const reviewingOrgName = await getOrgNameFromId(study.orgId)
            return (
                <CodePostDecisionView
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    entries={entries}
                    reviewingOrgName={reviewingOrgName}
                    dashboardHref={dashboardHref}
                    latestJobStatus="CODE-APPROVED"
                    feedbackLoadError={feedbackLoadError}
                    showStudyCode
                />
            )
        }

        // OTTER-538: once results exist, render the redesigned Study Details page (results-only).
        // Checked before the decision branch so a study that reached results never resolves to the
        // Code-approved page; studies/ready/route.ts blocks late scans once a results status exists.
        if (isStudyResultsStatus(latestJobStatus)) {
            return (
                <StudyDetailsResearcher
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    dashboardHref={dashboardHref}
                    returnTo={returnTo}
                />
            )
        }

        // Decision recorded, or the approved code is executing in the enclave: redesigned post-decision
        // page. A failed feedback fetch degrades to an inline notice on the same page (never the legacy view).
        if (decisionStatus !== null) {
            const entriesResult = await getCodeReviewFeedbackAction({ studyId })
            const feedbackLoadError = isActionError(entriesResult)
            const entries = feedbackLoadError ? [] : entriesResult
            // A code decision implies the study was submitted long ago — this branch
            // should be unreachable for DRAFTs. Guard explicitly so the narrowed view
            // type holds and a corrupt row can't surface a runtime error in render.
            if (!isSubmittedStudy(study)) {
                notFound()
            }
            const reviewingOrgName = await getOrgNameFromId(study.orgId)
            // During the execution window the page reads as "running / results pending": keep the
            // approved banner but drop the code listing (OTTER-598). Plain code decisions still show it.
            const isExecuting = hasJobStatus(job.statusChanges, STUDY_CODE_RUNNING_JOB_STATUSES)
            return (
                <CodePostDecisionView
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    entries={entries}
                    reviewingOrgName={reviewingOrgName}
                    dashboardHref={dashboardHref}
                    latestJobStatus={decisionStatus}
                    feedbackLoadError={feedbackLoadError}
                    showStudyCode={!isExecuting}
                />
            )
        }

        // Awaiting a decision: post-submission page with the under-review banner. No study.status gate;
        // the late-scan race is already absorbed by the decision branch above.
        if (isCodeUnderReviewStatus(latestJobStatus)) {
            const reviewingOrgName = await getOrgNameFromId(study.orgId)
            const submissionVersion = await countSubmittedJobsForStudy(study.id)
            // Feedback section is only meaningful on resubmissions; skip the extra query on v1.
            const feedbackEntries =
                submissionVersion > 1 ? actionResult(await getCodeReviewFeedbackAction({ studyId })) : []
            return (
                <CodePostSubmissionView
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    reviewingOrgName={reviewingOrgName}
                    dashboardHref={dashboardHref}
                    submissionVersion={submissionVersion}
                    feedbackEntries={feedbackEntries}
                />
            )
        }

        // Any remaining/unmapped status: post-submission page with the banner hidden, never the legacy view.
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
                  returnTo,
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
