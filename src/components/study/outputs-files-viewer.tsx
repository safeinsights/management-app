'use client'

import type { FC } from 'react'
import { FileOrImagePreviewModal } from '@/components/modals/file-or-image-preview-modal'
import { OutputsFilesSection } from '@/components/study/outputs-files-section'
import { useOutputsFiles } from '@/hooks/use-outputs-files'
import type { JobFileInfo } from '@/lib/types'

type OutputsFilesViewerProps = {
    jobId: string
    decryptedFiles: JobFileInfo[]
}

export const OutputsFilesViewer: FC<OutputsFilesViewerProps> = ({ jobId, decryptedFiles }) => {
    const files = useOutputsFiles({ jobId, decryptedFiles })
    const previewFile = files.viewing ? { name: files.viewing.name, contents: files.viewing.contents } : null

    return (
        <>
            <OutputsFilesSection
                rows={files.rows}
                isPreparingZip={files.isPreparingZip}
                onView={files.onView}
                onDownload={files.onDownload}
                onDownloadAll={files.onDownloadAll}
            />
            <FileOrImagePreviewModal
                file={previewFile}
                onClose={files.closeViewer}
                onDownload={files.onViewerDownload}
            />
        </>
    )
}
