'use client'

import { FC, ReactNode } from 'react'
import { PoliteStatus } from '@/components/polite-status'
import { CodeRunCard } from '@/components/study/code-run-card'
import { CodeRunHistory, usePriorRunOutputs } from '@/components/study/code-run-history'
import { CodeRunKeyFields } from '@/components/study/code-run-key-form'
import { useMarkOutputsDecisionViewed } from '@/components/study/mark-outputs-decision-viewed'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { ProposalStepHeader, VERIFY_OUTPUTS_STEP } from '@/components/study/proposal-step-header'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { StepNavigation } from '@/components/study/step-navigation'
import { useDecryptPhase } from '@/hooks/use-decrypt-phase'
import type { PhasedBannerCopy } from '@/lib/study-banners'
import type { PhasedStepNav } from '@/lib/study-screen'
import type { JobFileInfo } from '@/lib/types'
import type { PriorCodeRun } from '@/server/db/queries'

type SharedOutputsPanelProps = {
    decidedAt: Date | string | null
    // Copy rather than two ReactNodes: announcing the phase change needs ONE StatusAlert whose props
    // vary, since a remount drops the announcement.
    banner: PhasedBannerCopy
    job: { id: string }
    /** The status sentence under "Security key"; the screen picks it from the researcher's status. */
    keyDescription: string
    /** A node, not a render, so the phase flip cannot remount it and reset expand/collapse state. */
    feedbackSection: ReactNode
    /** One nav per phase, like `banner`: the panel picks, it does not derive. */
    nav: PhasedStepNav
    studyId: string
    /** Decided runs before the latest, newest first. */
    priorRuns: PriorCodeRun[]
}

// Shared outputs count as reviewed only once a key opens them, not when the page loads (OTTER-999).
function useUnlockSharedOutputs(studyId: string) {
    const { decryptedFiles, isLocked, onDecrypted: setDecryptedFiles } = useDecryptPhase()
    const markViewed = useMarkOutputsDecisionViewed(studyId)

    const onDecrypted = (files: JobFileInfo[]) => {
        setDecryptedFiles(files)
        markViewed(true)
    }

    return { decryptedFiles, isLocked, onDecrypted }
}

export const SharedOutputsPanel: FC<SharedOutputsPanelProps> = ({
    decidedAt,
    banner,
    job,
    keyDescription,
    feedbackSection,
    nav,
    studyId,
    priorRuns,
}) => {
    const { decryptedFiles, isLocked, onDecrypted } = useUnlockSharedOutputs(studyId)
    const priorOutputs = usePriorRunOutputs(priorRuns, 'researcher')
    const { variant, title, body } = isLocked ? banner.locked : banner.unlocked
    const phaseNav = isLocked ? nav.locked : nav.unlocked

    const bannerAlert = (
        <StatusAlert variant={variant} title={statusAlertTitle(title, decidedAt)} announce>
            {body}
        </StatusAlert>
    )

    return (
        <>
            <ProposalStepHeader
                stepLabel={VERIFY_OUTPUTS_STEP.label}
                heading={VERIFY_OUTPUTS_STEP.heading}
                banner={bannerAlert}
            />
            <CodeRunCard date={decidedAt}>
                <LatestRunOutputs
                    job={job}
                    description={keyDescription}
                    decryptedFiles={decryptedFiles}
                    onDecrypted={onDecrypted}
                    onKeyAccepted={priorOutputs.decryptWith}
                />
                {feedbackSection}
            </CodeRunCard>
            <CodeRunHistory
                role="researcher"
                runs={priorRuns}
                outputs={priorOutputs}
                isLatestDecrypted={decryptedFiles !== null}
            />
            <PoliteStatus announcement={priorOutputs.announcement} />
            <StepNavigation nav={phaseNav} />
        </>
    )
}

type LatestRunOutputsProps = {
    job: { id: string }
    description: string
    /** null until a key has successfully decrypted. */
    decryptedFiles: JobFileInfo[] | null
    onDecrypted: (files: JobFileInfo[]) => void
    /** Tries the key that opened the latest run on the earlier runs too. */
    onKeyAccepted: (privateKey: string) => void
}

// The key fields unmount rather than hide, so the input leaves the tab order once used (OTTER-696 AC).
const LatestRunOutputs: FC<LatestRunOutputsProps> = ({
    job,
    description,
    decryptedFiles,
    onDecrypted,
    onKeyAccepted,
}) => {
    if (decryptedFiles === null) {
        return (
            <CodeRunKeyFields
                job={job}
                type="researcher"
                description={description}
                onDecrypted={onDecrypted}
                onKeyAccepted={onKeyAccepted}
            />
        )
    }
    return <OutputsFilesViewer jobId={job.id} decryptedFiles={decryptedFiles} variant="embedded" autoFocusTitle />
}
