'use client'

import { FC } from 'react'
import { CodeRunHistory, PoliteStatus, usePriorRunOutputs } from '@/components/study/code-run-history'
import { CodeRunKeyForm } from '@/components/study/code-run-key-form'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { useDecryptPhase } from '@/hooks/use-decrypt-phase'
import type { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy, PriorCodeRun } from '@/server/db/queries'

type DecryptAndViewOutputsProps = {
    job: NonNullable<LatestJobForStudy>
    priorRuns: PriorCodeRun[]
    /** False when the job holds no encrypted artifact about the run's own outcome (OTTER-524). */
    isVisible: boolean
}

type LatestOutputsProps = {
    isVisible: boolean
    job: NonNullable<LatestJobForStudy>
    decryptedFiles: JobFileInfo[] | null
    onDecrypted: (files: JobFileInfo[]) => void
    onKeyAccepted: (privateKey: string) => void
}

const LatestOutputs: FC<LatestOutputsProps> = ({ isVisible, job, decryptedFiles, onDecrypted, onKeyAccepted }) => {
    if (!isVisible) return null

    if (decryptedFiles === null) {
        return (
            <CodeRunKeyForm
                job={job}
                description="The outputs are encrypted. Enter your security key to view them again."
                onDecrypted={onDecrypted}
                onKeyAccepted={onKeyAccepted}
            />
        )
    }

    return <OutputsFilesViewer jobId={job.id} decryptedFiles={decryptedFiles} autoFocusTitle />
}

// The history shares this component's state, so the key that opens the latest run can open the
// earlier ones too.
export const DecryptAndViewOutputs: FC<DecryptAndViewOutputsProps> = ({ job, priorRuns, isVisible }) => {
    const { decryptedFiles, onDecrypted } = useDecryptPhase()
    const priorOutputs = usePriorRunOutputs(priorRuns)

    return (
        <>
            <LatestOutputs
                isVisible={isVisible}
                job={job}
                decryptedFiles={decryptedFiles}
                onDecrypted={onDecrypted}
                onKeyAccepted={priorOutputs.decryptWith}
            />
            <CodeRunHistory
                runs={priorRuns}
                outputs={priorOutputs}
                isLatestDecrypted={!isVisible || decryptedFiles !== null}
            />
            <PoliteStatus message={priorOutputs.announcement} />
        </>
    )
}
