'use client'

import { FC } from 'react'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { useDecryptPhase } from '@/hooks/use-decrypt-phase'
import type { LatestJobForStudy } from '@/server/db/queries'

type DecryptAndViewOutputsProps = {
    job: NonNullable<LatestJobForStudy>
}

// Post-decision re-decrypt.
export const DecryptAndViewOutputs: FC<DecryptAndViewOutputsProps> = ({ job }) => {
    const { decryptedFiles, onDecrypted } = useDecryptPhase()

    if (decryptedFiles === null) {
        return (
            <SecurityKeyForm
                job={job}
                type="reviewer"
                onDecrypted={onDecrypted}
                title="View outputs again"
                description="The outputs are encrypted. Enter your security key to view them again."
            />
        )
    }

    return <OutputsFilesViewer jobId={job.id} decryptedFiles={decryptedFiles} />
}
