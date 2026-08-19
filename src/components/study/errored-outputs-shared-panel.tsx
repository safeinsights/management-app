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

const LOCKED_TITLE = 'Decrypt outputs to view code error'
const UNLOCKED_TITLE = 'Outputs and feedback available'
const UNLOCKED_BODY =
    "Review the outputs and feedback below. If they don't meet your expectations, you can update your code and resubmit."

const lockedBody = (dataPartner: string) =>
    `${dataPartner} has shared the outputs and feedback. Enter your security key below to decrypt and diagnose the issue.`

const resolveBannerCopy = ({ isLocked, dataPartner }: { isLocked: boolean; dataPartner: string }) =>
    isLocked
        ? { variant: STATUS_ALERT_VARIANT.action, title: LOCKED_TITLE, body: lockedBody(dataPartner) }
        : { variant: STATUS_ALERT_VARIANT.success, title: UNLOCKED_TITLE, body: UNLOCKED_BODY }

type ErroredOutputsSharedPanelProps = {
    studyTitle: string
    dataPartner: string
    /** When the reviewer submitted the decision; dates BOTH banners. Null degrades to undated. */
    decidedAt: Date | string | null
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
 * The researcher's errored-outputs step, in its two phases (OTTER-696).
 *
 * Mirrors OutputsReviewPanel's locked/unlocked split, over the same useDecryptPhase flip. One
 * StatusAlert spans both phases on purpose — swapping two banner COMPONENTS would remount the live
 * region and lose the announcement (see StatusAlert's `announce`). Both phases date from the SAME
 * event, the reviewer's decision, so `decidedAt` is computed once by the caller and reused here.
 */
export const ErroredOutputsSharedPanel: FC<ErroredOutputsSharedPanelProps> = ({
    studyTitle,
    dataPartner,
    decidedAt,
    job,
    feedbackSection,
    previousHref,
    editCodeHref,
    dashboardHref,
}) => {
    const { decryptedFiles, isLocked, onDecrypted } = useDecryptPhase()
    const { variant, title, body } = resolveBannerCopy({ isLocked, dataPartner })

    const banner = (
        <StatusAlert variant={variant} title={statusAlertTitle(title, decidedAt)} announce>
            {body}
        </StatusAlert>
    )

    return (
        <>
            <ProposalStepHeader stepLabel="STEP 4" heading="Verify outputs" studyTitle={studyTitle} banner={banner} />
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
