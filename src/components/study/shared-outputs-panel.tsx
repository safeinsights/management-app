'use client'

import { FC, ReactNode } from 'react'
import { useMarkOutputsDecisionViewed } from '@/components/study/mark-outputs-decision-viewed'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { ProposalStepHeader, VERIFY_OUTPUTS_STEP } from '@/components/study/proposal-step-header'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { StepNavigation } from '@/components/study/step-navigation'
import { useDecryptPhase } from '@/hooks/use-decrypt-phase'
import type { PhasedBannerCopy } from '@/lib/study-banners'
import type { PhasedStepNav } from '@/lib/study-screen'
import type { JobFileInfo } from '@/lib/types'

type SharedOutputsPanelProps = {
    decidedAt: Date | string | null
    // Copy rather than two ReactNodes: announcing the phase change needs ONE StatusAlert whose props
    // vary, since a remount drops the announcement.
    banner: PhasedBannerCopy
    job: { id: string }
    /** A node, not a render, so the phase flip cannot remount it and reset expand/collapse state. */
    feedbackSection: ReactNode
    /** One nav per phase, like `banner`: the panel picks, it does not derive. */
    nav: PhasedStepNav
    studyId: string
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
    feedbackSection,
    nav,
    studyId,
}) => {
    const { decryptedFiles, isLocked, onDecrypted } = useUnlockSharedOutputs(studyId)
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
            {feedbackSection}
            <LockedPhase isVisible={isLocked} job={job} onDecrypted={onDecrypted} />
            <UnlockedPhase decryptedFiles={decryptedFiles} jobId={job.id} />
            <StepNavigation nav={phaseNav} />
        </>
    )
}

type LockedPhaseProps = {
    isVisible: boolean
    job: { id: string }
    onDecrypted: (files: JobFileInfo[]) => void
}

// Unmounted rather than hidden so the input leaves the tab order once used (OTTER-696 AC).
const LockedPhase: FC<LockedPhaseProps> = ({ isVisible, job, onDecrypted }) => {
    if (!isVisible) return null
    return <SecurityKeyForm job={job} onDecrypted={onDecrypted} />
}

type UnlockedPhaseProps = {
    /** null until a key has successfully decrypted. */
    decryptedFiles: JobFileInfo[] | null
    jobId: string
}

const UnlockedPhase: FC<UnlockedPhaseProps> = ({ decryptedFiles, jobId }) => {
    if (decryptedFiles === null) return null
    return <OutputsFilesViewer jobId={jobId} decryptedFiles={decryptedFiles} />
}
