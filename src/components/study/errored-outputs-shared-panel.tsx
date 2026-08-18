'use client'

import { FC, ReactNode, useState } from 'react'
import type { Route } from 'next'
import { Group } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { StatusAlert, STATUS_ALERT_VARIANT, statusAlertTitle } from '@/components/study/status-alert'
import type { JobFileInfo } from '@/lib/types'

const LOCKED_TITLE = 'Decrypt outputs to view code error'
const UNLOCKED_TITLE = 'Outputs and feedback available'
const UNLOCKED_BODY =
    "Review the outputs and feedback below. If they don't meet your expectations, you can update your code and resubmit."

const lockedBody = (dataPartner: string) =>
    `${dataPartner} has shared the outputs and feedback. Enter your security key below to decrypt and diagnose the issue.`

type ErroredOutputsSharedPanelProps = {
    studyTitle: string
    dataPartner: string
    /** When the reviewer submitted the decision; dates BOTH banners. Null degrades to undated. */
    decidedAt: Date | string | null
    /** Only the id is read, by the key form's fetch and the outputs table. */
    job: { id: string }
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
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[] | null>(null)
    const isLocked = decryptedFiles === null
    const { variant, title, body } = isLocked
        ? { variant: STATUS_ALERT_VARIANT.action, title: LOCKED_TITLE, body: lockedBody(dataPartner) }
        : { variant: STATUS_ALERT_VARIANT.success, title: UNLOCKED_TITLE, body: UNLOCKED_BODY }

    const banner = (
        <StatusAlert variant={variant} title={statusAlertTitle(title, decidedAt)} announce>
            {body}
        </StatusAlert>
    )

    return (
        <>
            <ProposalStepHeader stepLabel="STEP 4" heading="Verify outputs" studyTitle={studyTitle} banner={banner} />
            {feedbackSection}
            {/* Unmounted rather than hidden: the input, its error state and the decrypt handler must
                all leave the DOM and the tab order once the key has done its job (OTTER-696 AC).
                type="researcher" because 'share-outputs' re-wraps the artifacts to the lab's public
                keys — unlike the reviewer's manifest path, there ARE per-file keys to fetch here. */}
            {isLocked && <SecurityKeyForm job={job} type="researcher" onDecrypted={setDecryptedFiles} />}
            {decryptedFiles && <OutputsFilesViewer jobId={job.id} decryptedFiles={decryptedFiles} />}
            <Group justify="space-between">
                <ButtonLink href={previousHref} variant="subtle" leftSection={<CaretLeftIcon />}>
                    Previous step
                </ButtonLink>
                {/* Both enabled from the moment they render: nothing further is required of the
                    researcher before editing or leaving. */}
                {!isLocked && (
                    <Group gap="md">
                        <ButtonLink href={editCodeHref} variant="outline" size="md">
                            Edit code
                        </ButtonLink>
                        <ButtonLink href={dashboardHref} variant="filled" size="md">
                            Back to my studies
                        </ButtonLink>
                    </Group>
                )}
            </Group>
        </>
    )
}
