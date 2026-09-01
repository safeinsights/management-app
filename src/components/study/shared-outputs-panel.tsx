'use client'

import { FC, ReactNode } from 'react'
import type { Route } from 'next'
import { Group } from '@mantine/core'
import { ButtonLink } from '@/components/links'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { PreviousStepLink } from '@/components/study/previous-step-link'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { StatusAlert, STATUS_ALERT_VARIANT, statusAlertTitle } from '@/components/study/status-alert'
import { useDecryptPhase } from '@/hooks/use-decrypt-phase'
import type { JobFileInfo } from '@/lib/types'

// Copy rather than two ReactNodes: announcing the phase change needs ONE StatusAlert whose props
// vary, since a remount drops the announcement.
export type SharedOutputsBannerCopy = {
    locked: { title: string; body: ReactNode }
    unlocked: { title: string; body: ReactNode }
}

type SharedOutputsPanelProps = {
    studyTitle: string
    decidedAt: Date | string | null
    banner: SharedOutputsBannerCopy
    job: { id: string }
    /** A node, not a render, so the phase flip cannot remount it and reset expand/collapse state. */
    feedbackSection: ReactNode
    previousHref: Route
    editCodeHref: Route
    dashboardHref: Route
}

export const SharedOutputsPanel: FC<SharedOutputsPanelProps> = ({
    studyTitle,
    decidedAt,
    banner,
    job,
    feedbackSection,
    previousHref,
    editCodeHref,
    dashboardHref,
}) => {
    const { decryptedFiles, isLocked, onDecrypted } = useDecryptPhase()
    const { title, body } = isLocked ? banner.locked : banner.unlocked
    const variant = isLocked ? STATUS_ALERT_VARIANT.action : STATUS_ALERT_VARIANT.success

    const bannerAlert = (
        <StatusAlert variant={variant} title={statusAlertTitle(title, decidedAt)} announce>
            {body}
        </StatusAlert>
    )

    return (
        <>
            <ProposalStepHeader
                stepLabel="STEP 4"
                heading="Verify outputs"
                studyTitle={studyTitle}
                banner={bannerAlert}
            />
            {feedbackSection}
            <LockedPhase isVisible={isLocked} job={job} onDecrypted={onDecrypted} />
            <UnlockedPhase decryptedFiles={decryptedFiles} jobId={job.id} />
            <Group justify="space-between">
                <PreviousStepLink previousHref={previousHref} />
                <PostDecryptionActions
                    isVisible={!isLocked}
                    editCodeHref={editCodeHref}
                    dashboardHref={dashboardHref}
                />
            </Group>
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

type PostDecryptionActionsProps = {
    isVisible: boolean
    editCodeHref: Route
    dashboardHref: Route
}

const PostDecryptionActions: FC<PostDecryptionActionsProps> = ({ isVisible, editCodeHref, dashboardHref }) => {
    if (!isVisible) return null
    return (
        <Group gap="md">
            {/* Both enabled from the moment they render: nothing further is required of the
                researcher before editing or leaving. */}
            <ButtonLink href={editCodeHref} variant="outline" size="md">
                Edit code
            </ButtonLink>
            <ButtonLink href={dashboardHref} variant="filled" size="md">
                Back to my studies
            </ButtonLink>
        </Group>
    )
}
