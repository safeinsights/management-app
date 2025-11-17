import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { latestJobForStudy } from '@/server/db/queries'
import { JobResults } from '@/components/job-results'
import { StudyDetails } from '@/components/study/study-details'
import { getStudyAction } from '@/server/actions/study.actions'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import React from 'react'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { CodeApprovalStatus, CodeRejectionStatus, FileApprovalStatus } from '@/components/study/job-approval-status'
import { JobResultsStatusMessage } from './job-results-status-message'
import { ResubmitButton } from '@/components/study/resubmit-button'

export const dynamic = 'force-dynamic'

export default async function StudyReviewPage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    // getStudyAction will check permissions
    const study = await getStudyAction({ studyId })
    if (!study || isActionError(study)) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const job = await latestJobForStudy(studyId)

    const isCodeRejected = job.statusChanges.some((sc) => sc.status === 'CODE-REJECTED')
    const isFilesApproved = job.statusChanges.some((sc) => sc.status === 'FILES-APPROVED')
    const isFilesRejected = job.statusChanges.some((sc) => sc.status === 'FILES-REJECTED')

    const shouldGreyOutSections = isCodeRejected || isFilesApproved || isFilesRejected

    const shouldShowTimestamps = !shouldGreyOutSections

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId,
                    orgSlug: study.orgSlug,
                    current: 'Study Details',
                }}
            />
            <Title order={1}>Study Details</Title>
            <Paper
                bg="white"
                p="xxl"
                opacity={shouldGreyOutSections ? 0.5 : 1}
                style={shouldGreyOutSections ? { pointerEvents: 'none' } : undefined}
            >
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Proposal
                        </Title>
                        {!isActionError(study) && shouldShowTimestamps && (
                            <StudyApprovalStatus status={study.status} date={study.approvedAt ?? study.rejectedAt} />
                        )}
                    </Group>
                    <StudyDetails studyId={studyId} />
                </Stack>
            </Paper>

            <Paper
                bg="white"
                p="xxl"
                opacity={shouldGreyOutSections ? 0.5 : 1}
                style={shouldGreyOutSections ? { pointerEvents: 'none' } : undefined}
            >
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Code
                        </Title>
                        {shouldShowTimestamps && <CodeApprovalStatus job={job} orgSlug={study.orgSlug} />}
                    </Group>
                    <Divider c="dimmed" />
                    <StudyCodeDetails job={job} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Status
                        </Title>

                        {isCodeRejected ? (
                            <CodeRejectionStatus job={job} />
                        ) : (
                            <FileApprovalStatus job={job} orgSlug={study.orgSlug} />
                        )}
                    </Group>
                    <Divider c="dimmed" />
                    <JobResultsStatusMessage job={job} orgSlug={study.orgSlug} />
                    <JobResults job={job} />
                    {isFilesApproved && <ResubmitButton studyId={job.studyId} orgSlug={orgSlug} />}
                </Stack>
            </Paper>
        </Stack>
    )
}
