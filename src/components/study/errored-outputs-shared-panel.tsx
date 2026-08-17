'use client'

import { FC, ReactNode, useState } from 'react'
import type { Route } from 'next'
import { Group } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { ButtonLink } from '@/components/links'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { StatusAlert, STATUS_ALERT_SEPARATOR, STATUS_ALERT_VARIANT } from '@/components/study/status-alert'
import type { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'

const LOCKED_TITLE = 'Decrypt outputs to view code error'
const UNLOCKED_TITLE = 'Outputs and feedback available'
const UNLOCKED_BODY =
    "Review the outputs and feedback below. If they don't meet your expectations, you can update your code and resubmit."

const lockedBody = (dataPartner: string) =>
    `${dataPartner} has shared the outputs and feedback. Enter your security key below to decrypt and diagnose the issue.`

// Both phases date from the SAME event — the reviewer's decision — so the date is computed once by
// the caller and reused here rather than re-derived per phase (a second lookup could drift).
const resolveBannerCopy = ({ isLocked, dataPartner }: { isLocked: boolean; dataPartner: string }) =>
    isLocked
        ? { variant: STATUS_ALERT_VARIANT.action, title: LOCKED_TITLE, body: lockedBody(dataPartner) }
        : { variant: STATUS_ALERT_VARIANT.success, title: UNLOCKED_TITLE, body: UNLOCKED_BODY }

type SecurityKeySectionProps = {
    isVisible: boolean
    job: NonNullable<LatestJobForStudy>
    onDecrypted: (files: JobFileInfo[]) => void
}

// Unmounting rather than hiding is the point: the input, its error state and the decrypt handler
// must all leave the DOM and the tab order once the key has done its job (OTTER-696 AC).
const SecurityKeySection: FC<SecurityKeySectionProps> = ({ isVisible, job, onDecrypted }) => {
    if (!isVisible) return null
    // The researcher key set: 'share-outputs' re-wraps the artifacts to the lab's public keys, so
    // unlike the reviewer's manifest path there ARE per-file keys to fetch here.
    return <SecurityKeyForm job={job} type="researcher" onDecrypted={onDecrypted} />
}

type OutputsSectionProps = {
    /** null until a key has successfully decrypted; the table is gated on it. */
    decryptedFiles: JobFileInfo[] | null
    jobId: string
}

const OutputsSection: FC<OutputsSectionProps> = ({ decryptedFiles, jobId }) => {
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

type ErroredOutputsSharedPanelProps = {
    studyTitle: string
    dataPartner: string
    /** When the reviewer submitted the decision; dates BOTH banners. Null degrades to undated. */
    decidedAt: Date | string | null
    job: NonNullable<LatestJobForStudy>
    /**
     * Rendered by the server screen and handed down as a node so the swap below cannot remount it:
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
 * Decryption happens in the browser and changes no server state, so "advancing" is a local phase
 * flip, not a route change: the study is JOB-ERRORED + FILES-APPROVED either side of it. One
 * StatusAlert spans both phases on purpose — swapping two banner COMPONENTS would remount the live
 * region and lose the announcement (see StatusAlert's `announce`).
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
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[] | null>(null)
    const isLocked = decryptedFiles === null
    const { variant, title, body } = resolveBannerCopy({ isLocked, dataPartner })
    // Display-only date: degrade to an undated banner rather than block a page routing already chose.
    const decidedOn = decidedAt ? ` ${STATUS_ALERT_SEPARATOR} ${dayjs(decidedAt).format('MMM DD, YYYY')}` : ''
    const banner = (
        <StatusAlert variant={variant} title={`${title}${decidedOn}`} announce>
            {body}
        </StatusAlert>
    )

    return (
        <>
            <ProposalStepHeader stepLabel="STEP 4" heading="Verify outputs" studyTitle={studyTitle} banner={banner} />
            {feedbackSection}
            <SecurityKeySection isVisible={isLocked} job={job} onDecrypted={setDecryptedFiles} />
            <OutputsSection decryptedFiles={decryptedFiles} jobId={job.id} />
            <Group justify="space-between">
                <ButtonLink href={previousHref} variant="subtle" leftSection={<CaretLeftIcon />}>
                    Previous step
                </ButtonLink>
                <PostDecryptionActions
                    isVisible={!isLocked}
                    editCodeHref={editCodeHref}
                    dashboardHref={dashboardHref}
                />
            </Group>
        </>
    )
}
