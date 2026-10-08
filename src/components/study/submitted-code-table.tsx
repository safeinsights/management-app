'use client'

import { useState, type FC } from 'react'
import { useQuery } from '@/common'
import { fetchStudyJobCodeFileAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { FileOrImagePreviewModal } from '@/components/modals/file-or-image-preview-modal'
import { SubmittedCodeTableView, type FileActivityByName } from './submitted-code-table-view'

interface SubmittedCodeTableProps {
    jobId: string
    files: LatestJobForStudy['files']
    activityByName: FileActivityByName
    dataPartnerName: string
    maxVisibleFiles?: number
    expanded?: boolean
    onToggleExpand?: () => void
}

export const SubmittedCodeTable: FC<SubmittedCodeTableProps> = ({
    jobId,
    files,
    activityByName,
    dataPartnerName,
    maxVisibleFiles,
    expanded,
    onToggleExpand,
}) => {
    const [previewFileName, setPreviewFileName] = useState<string | null>(null)

    const { data } = useQuery({
        queryKey: ['study-job-code-file', jobId, previewFileName],
        queryFn: () => fetchStudyJobCodeFileAction({ studyJobId: jobId, fileName: previewFileName as string }),
        enabled: !!previewFileName,
        staleTime: Infinity,
    })

    const previewFile = previewFileName
        ? { name: previewFileName, contents: data?.fileName === previewFileName ? data.contents : null }
        : null

    return (
        <>
            <SubmittedCodeTableView
                jobId={jobId}
                files={files}
                dataPartnerName={dataPartnerName}
                activityByName={activityByName}
                onPreview={setPreviewFileName}
                maxVisibleFiles={maxVisibleFiles}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
            />
            {!!files?.length && <FileOrImagePreviewModal file={previewFile} onClose={() => setPreviewFileName(null)} />}
        </>
    )
}
