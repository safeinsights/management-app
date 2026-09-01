'use client'

import { FC } from 'react'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { useDecryptPhase } from '@/hooks/use-decrypt-phase'
import type { LatestJobForStudy } from '@/server/db/queries'

type DecryptAndViewOutputsProps = {
    job: NonNullable<LatestJobForStudy>
    /** False when the job holds no encrypted artifact about the run's own outcome (OTTER-524). */
    isVisible: boolean
}

export const DecryptAndViewOutputs: FC<DecryptAndViewOutputsProps> = ({ job, isVisible }) => {
    const { decryptedFiles, onDecrypted } = useDecryptPhase()

    if (!isVisible) return null

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
