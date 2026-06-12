'use client'

import { CopyingInput } from '@/components/copying-input'
import { useJobStatus } from '@/hooks/use-job-results-status'
import { isLogType } from '@/lib/file-type-helpers'
import { LatestJobForStudy } from '@/server/db/queries'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { FC, ReactNode } from 'react'
import { ResubmitButton } from '@/components/study/resubmit-button'
import { JobResults } from '@/components/job-results'
import { type FileType } from '@/database/types'

export type JobResultsStatusMessageProps = {
    job: LatestJobForStudy
    files: { fileType: FileType }[]
    submittingOrgSlug: string
}

const Panel: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
    <Paper bg="white" p="xxl">
        <Stack>
            <Group justify="space-between" align="center">
                <Title order={4} size="xl">
                    {title}
                </Title>
            </Group>
            <Divider c="dimmed" />
            {children}
        </Stack>
    </Paper>
)

export const JobResultsStatusMessage: FC<JobResultsStatusMessageProps> = ({ job, files, submittingOrgSlug }) => {
    const { isApproved, isRejected, isFilesRejected, isErrored } = useJobStatus(job.statusChanges)

    if (!isApproved && !isRejected) {
        return (
            <Panel title="Study Status">
                <Text>Study results will become available once the data organization reviews and approves them.</Text>
            </Panel>
        )
    }

    let message: string
    let additionalContent: ReactNode = null

    if (isApproved && isErrored) {
        const hasLogs = files.some((file) => isLogType(file.fileType))
        message = hasLogs
            ? 'The code errored. Review error logs and consider re-submitting an updated study code.'
            : 'The code errored. While logs are not available at this time, consider re-submitting an updated study code.'
        additionalContent = (
            <Group justify="flex-start" align="center">
                <Text size="sm" fw={600}>
                    Job ID:
                </Text>
                <CopyingInput value={job.id} tooltipLabel="Copy" />
            </Group>
        )
    } else if (isApproved) {
        message =
            'The results of your study have been approved by the data organization and are now available to you. If you are not satisfied with them, you can resubmit your code to generate a new outcome.'
    } else if (isFilesRejected) {
        message =
            'The results of your study have not been released by the data organization, possibly due to the presence of personally identifiable information (PII). Consider resubmitting an updated study code.'
    } else {
        message =
            'This study code has not been approved by the data organization. Consider resubmitting an updated study code.'
    }

    return (
        <>
            <Panel title="Study Status">
                <Text>{message}</Text>
                {additionalContent}
                {/* TODO(UX): the Resubmit button shows for approved results too. Confirm with UX
                    whether a researcher should be able to resubmit code after results are approved,
                    or only on error/rejection — then gate this accordingly. */}
                <Group>
                    <ResubmitButton studyId={job.studyId} orgSlug={submittingOrgSlug} />
                </Group>
            </Panel>
            {isApproved && (
                <Panel title="Results">
                    <JobResults job={job} />
                </Panel>
            )}
        </>
    )
}
