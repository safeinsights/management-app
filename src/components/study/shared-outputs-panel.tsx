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

/**
 * Per-phase banner copy, supplied by the screen.
 *
 * Copy rather than two ReactNodes (which is how OutputsReviewPanel takes its banners): this panel
 * announces the phase change, and announcing only works while the live region stays mounted across
 * the swap. Two nodes swapped by a conditional would remount it and drop the announcement, so the
 * panel keeps ONE StatusAlert and varies its props. Titles are undated — the panel appends the
 * shared decision date to both.
 */
export type SharedOutputsBannerCopy = {
    locked: { title: string; body: ReactNode }
    unlocked: { title: string; body: ReactNode }
}

type SharedOutputsPanelProps = {
    studyTitle: string
    /** When the reviewer submitted the decision; dates BOTH phases. Null degrades to undated. */
    decidedAt: Date | string | null
    banner: SharedOutputsBannerCopy
    /** Only the id is read, by the key form's fetch and the outputs table. */
    job: { id: string }
    /**
     * Rendered by the server screen and handed down as a node so the phase flip cannot remount it:
     * a remount would reset each entry's expand/collapse state mid-read.
     */
    feedbackSection: ReactNode
    previousHref: Route
    editCodeHref: Route
    dashboardHref: Route
}

/**
 * The researcher's step for outputs a reviewer chose to share, in its two phases (OTTER-696).
 *
 * Shared by the errored and clean-run screens: they differ only in banner copy and their routing
 * predicate, so everything below — the decryption lifecycle, the outputs table, and the navigation
 * that changes across the flip — lives here once. Mirrors OutputsReviewPanel's locked/unlocked
 * split over the same useDecryptPhase flip.
 */
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

// Unmounted rather than hidden: the input, its error state and the decrypt handler must all leave
// the DOM and the tab order once the key has done its job (OTTER-696 AC).
const LockedPhase: FC<LockedPhaseProps> = ({ isVisible, job, onDecrypted }) => {
    if (!isVisible) return null
    // The researcher key set: 'share-outputs' re-wraps the artifacts to the lab's public keys, so
    // unlike the reviewer's manifest path there ARE per-file keys to fetch here.
    return <SecurityKeyForm job={job} type="researcher" onDecrypted={onDecrypted} />
}

type UnlockedPhaseProps = {
    /** null until a key has successfully decrypted; the table is gated on it. */
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
