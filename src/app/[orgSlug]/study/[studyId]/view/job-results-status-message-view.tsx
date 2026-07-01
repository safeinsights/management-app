'use client'

import { FC, ReactNode } from 'react'
import { Group, Stack, Text } from '@mantine/core'
import { CopyingInput } from '@/components/copying-input'
import { useJobStatus, type StatusChange } from '@/hooks/use-job-results-status'
import { isLogType } from '@/lib/file-type-helpers'
import { ResubmitButton } from '@/components/study/resubmit-button'
import { type FileType } from '@/database/types'

// Presentational researcher status message. It owns the status copy + resubmit row, but
// receives the approved-results listing via the `results` slot. Kept in its OWN file (free
// of JobResults' useQuery/server action and the @/server/db value import) so it renders in
// isolation (e.g. Ladle). The JobResultsStatusMessage container (./job-results-status-message)
// injects the real <JobResults/>.

type StatusFlags = {
    isApproved: boolean
    isRejected: boolean
    isFilesRejected: boolean
    isErrored: boolean
}

type StatusBody = {
    message: string
    additionalContent: ReactNode
    hideResults: boolean
} | null

// Pure resolution of the researcher-facing status copy. Returns null for the pending/default
// state so the view can short-circuit to the "results pending" message without the resubmit row.
function resolveStatusBody(flags: StatusFlags, files: { fileType: FileType }[], jobId: string): StatusBody {
    const { isApproved, isRejected, isFilesRejected, isErrored } = flags

    if (isApproved) {
        if (isErrored) {
            const hasLogs = files.some((file) => isLogType(file.fileType))
            const message = hasLogs
                ? 'The code errored. Review error logs and consider re-submitting an updated study code.'
                : 'The code errored. While logs are not available at this time, consider re-submitting an updated study code.'
            return {
                message,
                additionalContent: (
                    <Group justify="flex-start" align="center">
                        <Text size="sm" fw={600}>
                            Job ID:
                        </Text>
                        <CopyingInput value={jobId} tooltipLabel="Copy" />
                    </Group>
                ),
                hideResults: false,
            }
        }
        return {
            message:
                'The results of your study have been approved by the Data Partner and are now available to you. If you are not satisfied with them, you can resubmit your code to generate a new outcome.',
            additionalContent: null,
            hideResults: false,
        }
    }

    if (isRejected) {
        const message = isFilesRejected
            ? 'The results of your study have not been released by the Data Partner, possibly due to the presence of personally identifiable information (PII). Consider resubmitting an updated study code.'
            : 'This study code has not been approved by the Data Partner. Consider resubmitting an updated study code.'
        return { message, additionalContent: null, hideResults: true }
    }

    return null
}

export type JobResultsStatusMessageViewProps = {
    statusChanges: StatusChange[]
    files: { fileType: FileType }[]
    jobId: string
    studyId: string
    submittingOrgSlug: string
    /** Approved-results listing (View/Download links). Injected by the container because it fetches; in isolation a story passes a placeholder. */
    results: ReactNode
}

export const JobResultsStatusMessageView: FC<JobResultsStatusMessageViewProps> = ({
    statusChanges,
    files,
    jobId,
    studyId,
    submittingOrgSlug,
    results,
}) => {
    const flags = useJobStatus(statusChanges)
    const body = resolveStatusBody(flags, files, jobId)

    if (!body) {
        return <Text>Study results will become available once the Data Partner reviews and approves them.</Text>
    }

    return (
        <Stack>
            <Text>{body.message}</Text>
            {body.additionalContent}
            {!body.hideResults && results}
            <Group>
                <ResubmitButton studyId={studyId} orgSlug={submittingOrgSlug} />
            </Group>
        </Stack>
    )
}
