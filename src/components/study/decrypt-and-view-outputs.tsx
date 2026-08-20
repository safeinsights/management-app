'use client'

import { FC } from 'react'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { useDecryptPhase } from '@/hooks/use-decrypt-phase'
import type { LatestJobForStudy } from '@/server/db/queries'

type DecryptAndViewOutputsProps = {
    job: NonNullable<LatestJobForStudy>
    /**
     * False when the job holds nothing a key can open, so the form would be a dead end (OTTER-524).
     *
     * A decided run with no such artifact is routine now that a reviewer can close out an errored run
     * that produced nothing: coming back to this page would otherwise ask them for a key to view
     * outputs that do not exist, and no key they hold could ever satisfy it.
     */
    isVisible: boolean
}

// Post-decision re-decrypt.
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
