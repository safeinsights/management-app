'use client'

import { FC, useState } from 'react'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
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

    return <OutputsFilesViewer jobId={job.id} decryptedFiles={decryptedFiles} />
}
