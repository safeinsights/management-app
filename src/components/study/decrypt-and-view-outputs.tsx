'use client'

import { FC } from 'react'
import { PoliteStatus } from '@/components/polite-status'
import { CodeRunCard } from '@/components/study/code-run-card'
import { CodeRunFeedback, type CodeRunFeedbackRow } from '@/components/study/code-run-feedback'
import { CodeRunHistory, usePriorRunOutputs } from '@/components/study/code-run-history'
import { CodeRunKeyFields } from '@/components/study/code-run-key-form'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { useDecryptPhase } from '@/hooks/use-decrypt-phase'
import type { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy, PriorCodeRun } from '@/server/db/queries'

type DecryptAndViewOutputsProps = {
    job: NonNullable<LatestJobForStudy>
    priorRuns: PriorCodeRun[]
    /** False when the job holds no encrypted artifact about the run's own outcome (OTTER-524). */
    hasDecryptableOutputs: boolean
    /** The latest run's outputs decisions only; earlier runs show theirs in the history. */
    latestFeedback: CodeRunFeedbackRow[]
    feedbackLoadError: boolean
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
            <CodeRunKeyFields
                job={job}
                description="The outputs are encrypted. Enter your security key to view them again."
                onDecrypted={onDecrypted}
                onKeyAccepted={onKeyAccepted}
            />
        )
    }

    return <OutputsFilesViewer jobId={job.id} decryptedFiles={decryptedFiles} variant="embedded" autoFocusTitle />
}

// The history shares this component's state, so the key that opens the latest run can open the
// earlier ones too. The card stays when there is nothing to decrypt, so its feedback is never
// hidden behind the key.
export const DecryptAndViewOutputs: FC<DecryptAndViewOutputsProps> = ({
    job,
    priorRuns,
    hasDecryptableOutputs,
    latestFeedback,
    feedbackLoadError,
}) => {
    const { decryptedFiles, onDecrypted } = useDecryptPhase()
    const priorOutputs = usePriorRunOutputs(priorRuns)

    return (
        <>
            <CodeRunCard job={job}>
                <LatestOutputs
                    isVisible={hasDecryptableOutputs}
                    job={job}
                    decryptedFiles={decryptedFiles}
                    onDecrypted={onDecrypted}
                    onKeyAccepted={priorOutputs.decryptWith}
                />
                <CodeRunFeedback feedback={latestFeedback} loadError={feedbackLoadError} testId="latest-run-feedback" />
            </CodeRunCard>
            <CodeRunHistory
                runs={priorRuns}
                outputs={priorOutputs}
                isLatestDecrypted={!hasDecryptableOutputs || decryptedFiles !== null}
            />
            <PoliteStatus announcement={priorOutputs.announcement} />
        </>
    )
}
