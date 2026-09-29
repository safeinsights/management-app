'use client'

import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { captureException } from '@sentry/nextjs'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import type { ActivityState, OutputFileRowData } from '@/components/study/outputs-file-row'
import { downloadBlob } from '@/lib/download-blob'
import { compareOutputFiles } from '@/lib/outputs-review'
import { zipFiles } from '@/lib/zip-files'
import type { JobFileInfo } from '@/lib/types'
import { actionResult } from '@/lib/utils'
import {
    fetchJobFileActivityAction,
    recordJobFileActivityAction,
} from '@/server/actions/study-job-file-activity.actions'
import type { StudyJobFileAction } from '@/database/types'
import type { JobFileActivity } from '@/server/db/queries'

// Keyed on the org too: a dual-role user moving between the two sides of one study must not be
// served the other side's rows from cache (OTTER-783).
const activityQueryKey = (jobId: string, orgSlug: string) => ['job-file-activity', jobId, orgSlug]

const rowKey = (file: JobFileInfo) => `${file.sourceId}:${file.path}`

const displayName = (path: string) => path.split('/').pop() || path

const resolveActivityState = (activity: JobFileActivity[] | undefined, hasFailed: boolean): ActivityState => {
    if (hasFailed) return 'unavailable'
    return activity === undefined ? 'pending' : 'known'
}

type UseOutputsFilesOptions = {
    jobId: string
    decryptedFiles: JobFileInfo[]
}

export function useOutputsFiles({ jobId, decryptedFiles }: UseOutputsFilesOptions) {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const queryClient = useQueryClient()
    const [viewing, setViewing] = useState<OutputFileRowData | null>(null)
    const [isPreparingZip, setIsPreparingZip] = useState(false)

    const { data: activity, isError: hasActivityFailed } = useQuery({
        queryKey: activityQueryKey(jobId, orgSlug),
        queryFn: () => fetchJobFileActivityAction({ jobId, orgSlug }),
        // Opts this poll in to the shared reporter, so a reviewer learns that the column is stale
        // rather than reading the last good rows as current (OTTER-726).
        meta: { errorMessage: 'Failed to load file activity' },
    })

    const activityState = resolveActivityState(activity, hasActivityFailed)

    const { mutate: recordActivity } = useMutation({
        mutationFn: async (variables: { files: OutputFileRowData[]; action: StudyJobFileAction }) =>
            actionResult(
                await recordJobFileActivityAction({
                    jobId,
                    orgSlug,
                    files: variables.files.map((file) => ({
                        studyJobFileId: file.studyJobFileId,
                        filePath: file.filePath,
                    })),
                    action: variables.action,
                }),
            ),
        // Not surfaced: an audit side effect of an action that already succeeded, so a toast would
        // report a failure the reviewer cannot act on and did not cause.
        onError: (error) => captureException(error),
        // Refetch rather than optimistically patch: the row shows the actor's name and the
        // server's timestamp, neither of which the client can produce accurately.
        onSettled: () => queryClient.invalidateQueries({ queryKey: activityQueryKey(jobId, orgSlug) }),
    })

    const rows = useMemo<OutputFileRowData[]>(() => {
        // Dropped on a failed poll rather than carried: TanStack keeps the last good data through
        // one, and a row naming an actor and a time reads as a statement about now.
        const activityRows = activityState === 'known' ? (activity ?? []) : []
        // Copied before sorting: decryptedFiles is owned by the caller and shared with the
        // researcher panels, so ordering it in place would reorder their list too.
        return decryptedFiles
            .map((file) => ({ file, name: displayName(file.path) }))
            .sort((a, b) =>
                compareOutputFiles(
                    { fileType: a.file.fileType, name: a.name },
                    { fileType: b.file.fileType, name: b.name },
                ),
            )
            .map(({ file, name }) => ({
                key: rowKey(file),
                studyJobFileId: file.sourceId,
                filePath: file.path,
                name,
                contents: file.contents,
                activityState,
                activity:
                    activityRows.find((row) => row.studyJobFileId === file.sourceId && row.filePath === file.path) ??
                    null,
            }))
    }, [decryptedFiles, activity, activityState])

    const onView = useCallback(
        (row: OutputFileRowData) => {
            setViewing(row)
            recordActivity({ files: [row], action: 'VIEWED' })
        },
        [recordActivity],
    )

    const onDownload = useCallback(
        (row: OutputFileRowData) => {
            downloadBlob(row.name, new Blob([row.contents]))
            recordActivity({ files: [row], action: 'DOWNLOADED' })
        },
        [recordActivity],
    )

    // The preview modal's own download link does the transfer itself, so without this a reviewer
    // who downloads from there still shows as having only "Viewed".
    const onViewerDownload = useCallback(() => {
        if (!viewing) return
        recordActivity({ files: [viewing], action: 'DOWNLOADED' })
    }, [viewing, recordActivity])

    const onDownloadAll = useCallback(async () => {
        if (!rows.length) return
        setIsPreparingZip(true)
        try {
            const blob = await zipFiles(rows.map((row) => ({ name: row.name, contents: row.contents })))
            downloadBlob('outputs.zip', blob)
            recordActivity({ files: rows, action: 'DOWNLOADED' })
        } catch (error) {
            // Zipping runs in-browser over in-memory plaintext, so an OOM on a large result set
            // would otherwise be an unhandled rejection with no user feedback.
            reportMutationError('Failed to prepare the download')(error as Error)
        } finally {
            setIsPreparingZip(false)
        }
    }, [rows, recordActivity])

    return {
        rows,
        viewing,
        closeViewer: () => setViewing(null),
        isPreparingZip,
        onView,
        onDownload,
        onViewerDownload,
        onDownloadAll,
    }
}
