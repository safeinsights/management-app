'use client'

import { FC, useState } from 'react'
import { FileOrImagePreviewModal } from '@/components/modals/file-or-image-preview-modal'
import { OutputsFilesSection } from '@/components/study/outputs-files-section'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { useOutputsFiles } from '@/hooks/use-outputs-files'
import type { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'

type DecryptAndViewOutputsProps = {
    job: NonNullable<LatestJobForStudy>
}

// Post-decision re-decrypt.
export const DecryptAndViewOutputs: FC<DecryptAndViewOutputsProps> = ({ job }) => {
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[] | null>(null)

    if (decryptedFiles === null) {
        return (
            <SecurityKeyForm
                job={job}
                type="reviewer"
                onDecrypted={setDecryptedFiles}
                title="View outputs again"
                description="The outputs are encrypted. Enter your security key to view them again."
            />
        )
    }

    return <DecryptedOutputs jobId={job.id} decryptedFiles={decryptedFiles} />
}

type DecryptedOutputsProps = {
    jobId: string
    decryptedFiles: JobFileInfo[]
}

const DecryptedOutputs: FC<DecryptedOutputsProps> = ({ jobId, decryptedFiles }) => {
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
