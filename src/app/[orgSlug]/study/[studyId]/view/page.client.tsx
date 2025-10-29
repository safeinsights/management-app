'use client'

import { JobResults } from '@/components/job-results'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { CodeApprovalStatus, FileApprovalStatus } from '@/components/study/job-approval-status'
import { OpenWorkspaceButton } from '@/components/study/open-workspace-button'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { StudyDetails } from '@/components/study/study-details'
import { StudyStatus } from '@/database/types'
import { isActionError } from '@/lib/errors'
import { checkWorkspaceExistsAction } from '@/server/actions/coder.actions'
import { LatestJobForStudy } from '@/server/db/queries'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { JobResultsStatusMessage } from './job-results-status-message'

export function StudyReviewClient({
    study,
    job,
    email,
    name,
    workspaceAlreadyExists,
}: {
    study: {
        status: StudyStatus
        approvedAt: Date | null
        rejectedAt: Date | null
        orgSlug: string
        id: string
        title: string
        piName: string
        createdBy: string
        researcherId: string
    }
    job: LatestJobForStudy
    email: string
    name: string
    workspaceAlreadyExists: boolean
}) {
    // State for workspace existence
    const [workspaceExists, setWorkspaceExists] = useState(workspaceAlreadyExists)
    const [workspaceReady, setWorkspaceReady] = useState(false)

    // Periodic checking function
    useEffect(() => {
        const checkWorkspacePeriodically = async () => {
            try {
                const result = await checkWorkspaceExistsAction({
                    email,
                    userId: study.researcherId,
                    studyId: study.id,
                })
                if (!isActionError(result)) {
                    setWorkspaceExists(result.exists)
                    setWorkspaceReady(result.data?.latest_build?.status === 'running')
                }
            } catch (error) {
                console.error('Error checking workspace:', error)
            }
        }

        // Check immediately
        checkWorkspacePeriodically()

        // Set up interval to check every 5 seconds
        const intervalId = setInterval(checkWorkspacePeriodically, 5000)

        // Cleanup on unmount
        return () => clearInterval(intervalId)
    }, [email, study.researcherId, study.id])

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId: study.id,
                    orgSlug: study.orgSlug,
                    current: 'Study Details',
                }}
            />
            <Title order={1}>Study Details</Title>
            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Proposal
                        </Title>
                        {!isActionError(study) && (
                            <StudyApprovalStatus status={study.status} date={study.approvedAt ?? study.rejectedAt} />
                        )}
                    </Group>
                    <StudyDetails studyId={study.id} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Code
                        </Title>
                        <Group>
                            <CodeApprovalStatus job={job} orgSlug={study.orgSlug} />
                            <OpenWorkspaceButton
                                name={name}
                                email={email}
                                userId={study.researcherId}
                                studyId={study.id}
                                alreadyExists={workspaceExists}
                                isReady={workspaceReady}
                            />
                        </Group>
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
                        <FileApprovalStatus job={job} orgSlug={study.orgSlug} />
                    </Group>
                    <Divider c="dimmed" />
                    <JobResultsStatusMessage job={job} orgSlug={study.orgSlug} />
                    <JobResults job={job} />
                </Stack>
            </Paper>
        </Stack>
    )
}
