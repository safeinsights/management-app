'use client'

import { useCallback, useMemo, useState } from 'react'
import { captureException } from '@sentry/nextjs'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import type { OutputFileRowData } from '@/components/study/outputs-file-row'
import { downloadBlob } from '@/lib/download-blob'
import { zipFiles } from '@/lib/zip-files'
import type { JobFileInfo } from '@/lib/types'
import { actionResult } from '@/lib/utils'
import {
    fetchJobFileActivityAction,
    recordJobFileActivityAction,
} from '@/server/actions/study-job-file-activity.actions'
import type { StudyJobFileAction } from '@/database/types'

const activityQueryKey = (jobId: string) => ['job-file-activity', jobId]

const rowKey = (file: JobFileInfo) => `${file.sourceId}:${file.path}`

// The inner path can carry directories ("results/summary.csv"); the table shows the leaf, which
// is what the reviewer recognizes.
const displayName = (path: string) => path.split('/').pop() || path

type UseOutputsFilesOptions = {
    jobId: string
    decryptedFiles: JobFileInfo[]
}

export function useOutputsFiles({ jobId, decryptedFiles }: UseOutputsFilesOptions) {
    const queryClient = useQueryClient()
    const [viewing, setViewing] = useState<OutputFileRowData | null>(null)
    const [isPreparingZip, setIsPreparingZip] = useState(false)

    const { data: activity } = useQuery({
        queryKey: activityQueryKey(jobId),
        queryFn: () => fetchJobFileActivityAction({ jobId }),
    })

    const { mutate: recordActivity } = useMutation({
        mutationFn: async (variables: { files: OutputFileRowData[]; action: StudyJobFileAction }) =>
            actionResult(
                await recordJobFileActivityAction({
                    jobId,
                    files: variables.files.map((file) => ({
                        studyJobFileId: file.studyJobFileId,
                        filePath: file.filePath,
                    })),
                    action: variables.action,
                }),
            ),
        // Deliberately not surfaced to the user. This is an audit side effect of an action that
        // already succeeded: the file was viewed or downloaded either way, so a toast reading
        // "Failed to record file activity" would report a failure the reviewer cannot act on and
        // did not cause. Sentry still sees it.
        onError: (error) => captureException(error),
        // Refetch rather than optimistically patch: the row shows the actor's name and the
        // server's timestamp, neither of which the client can produce accurately.
        onSettled: () => queryClient.invalidateQueries({ queryKey: activityQueryKey(jobId) }),
    })

    const rows = useMemo<OutputFileRowData[]>(() => {
        const activityRows = Array.isArray(activity) ? activity : []
        return decryptedFiles.map((file) => ({
            key: rowKey(file),
            studyJobFileId: file.sourceId,
            filePath: file.path,
            name: displayName(file.path),
            contents: file.contents,
            activity:
                activityRows.find((row) => row.studyJobFileId === file.sourceId && row.filePath === file.path) ?? null,
        }))
    }, [decryptedFiles, activity])

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

    // The reused preview modal carries its own download link, which does the transfer itself. Log
    // it anyway, or a reviewer who opens a file and downloads it from there would keep showing as
    // having only "Viewed" it.
    const onViewerDownload = useCallback(() => {
        if (!viewing) return
        recordActivity({ files: [viewing], action: 'DOWNLOADED' })
    }, [viewing, recordActivity])

    // "Download all" counts as a download of every file, so each row's Last activity updates,
    // not just one aggregate row.
    const onDownloadAll = useCallback(async () => {
        if (!rows.length) return
        setIsPreparingZip(true)
        try {
            const blob = await zipFiles(rows.map((row) => ({ name: row.name, contents: row.contents })))
            downloadBlob('outputs.zip', blob)
            recordActivity({ files: rows, action: 'DOWNLOADED' })
        } catch (error) {
            // Zipping happens in the browser over in-memory plaintext; a failure here (out of
            // memory on a large result set) would otherwise surface as an unhandled rejection from
            // the click handler and leave the user with no feedback at all.
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
