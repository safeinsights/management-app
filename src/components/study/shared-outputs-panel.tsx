'use client'

import { FC, ReactNode } from 'react'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { StatusAlert, STATUS_ALERT_VARIANT, statusAlertTitle } from '@/components/study/status-alert'
import { StepNavigation } from '@/components/study/step-navigation'
import { useDecryptPhase } from '@/hooks/use-decrypt-phase'
import type { PhasedStepNav } from '@/lib/study-screen'
import type { JobFileInfo } from '@/lib/types'

// Copy rather than two ReactNodes: announcing the phase change needs ONE StatusAlert whose props
// vary, since a remount drops the announcement.
export type SharedOutputsBannerCopy = {
    locked: { title: string; body: ReactNode }
    unlocked: { title: string; body: ReactNode }
}

type SharedOutputsPanelProps = {
    decidedAt: Date | string | null
    banner: SharedOutputsBannerCopy
    job: { id: string }
    /** A node, not a render, so the phase flip cannot remount it and reset expand/collapse state. */
    feedbackSection: ReactNode
    /** One nav per phase, like `banner`: the panel picks, it does not derive. */
    nav: PhasedStepNav
}

export const SharedOutputsPanel: FC<SharedOutputsPanelProps> = ({ decidedAt, banner, job, feedbackSection, nav }) => {
    const { decryptedFiles, isLocked, onDecrypted } = useDecryptPhase()
    const { title, body } = isLocked ? banner.locked : banner.unlocked
    const variant = isLocked ? STATUS_ALERT_VARIANT.action : STATUS_ALERT_VARIANT.success
    const phaseNav = isLocked ? nav.locked : nav.unlocked

    const bannerAlert = (
        <StatusAlert variant={variant} title={statusAlertTitle(title, decidedAt)} announce>
            {body}
        </StatusAlert>
    )

    return (
        <>
            <ProposalStepHeader stepLabel="STEP 4" heading="Verify outputs" banner={bannerAlert} />
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
    return <SecurityKeyForm job={job} type="researcher" onDecrypted={onDecrypted} />
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
