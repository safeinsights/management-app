'use client'

import { useState, type FC } from 'react'
import { useQuery } from '@/common'
import { fetchStudyJobCodeFileAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { FileOrImagePreviewModal } from '@/components/modals/file-or-image-preview-modal'
import { SubmittedCodeTableView } from './submitted-code-table-view'

interface SubmittedCodeTableProps {
    jobId: string
    files: LatestJobForStudy['files']
}

export const SubmittedCodeTable: FC<SubmittedCodeTableProps> = ({ jobId, files }) => {
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
            <SubmittedCodeTableView jobId={jobId} files={files} onPreview={(file) => setPreviewFileName(file.name)} />
            {!!files?.length && <FileOrImagePreviewModal file={previewFile} onClose={() => setPreviewFileName(null)} />}
        </>
    )
}
