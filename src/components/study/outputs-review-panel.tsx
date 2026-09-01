'use client'

import { FC, ReactNode } from 'react'
import type { Route } from 'next'
import { Box, Button, Group, Stack } from '@mantine/core'
import { OutputsDecisionSection } from '@/components/study/outputs-decision-section'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { PreviousStepLink } from '@/components/study/previous-step-link'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { SubmitOutputsDecisionModal } from '@/components/study/submit-outputs-decision-modal'
import { useDecryptPhase } from '@/hooks/use-decrypt-phase'
import { useOutputsDecision } from '@/hooks/use-outputs-decision'
import { jobHasDecryptableRunOutcome } from '@/lib/file-type-helpers'
import type { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'

// Module-level so the no-key path hands the same array identity down on every render.
const NO_FILES: JobFileInfo[] = []

type OutputsReviewPanelProps = {
    orgSlug: string
    studyId: string
    studyTitle: string
    job: NonNullable<LatestJobForStudy>
    labName: string
    /** Shown while the outputs are still encrypted (OTTER-667 / OTTER-668 copy). */
    lockedBanner: ReactNode
    /** Replaces it once the key decrypts, warning the reviewer to check before sharing. */
    unlockedBanner: ReactNode
    previousHref: Route
    /** Only the errored screen sets this: for a completed run, no artifacts means delivery
     * went wrong, so the key step must not be skipped (OTTER-524). */
    allowDecisionWithoutArtifacts?: boolean
}

// Both phases live in one component so the decrypted plaintext stays in memory and never
// reaches the server; advancing is a local flip, not a route change.
export const OutputsReviewPanel: FC<OutputsReviewPanelProps> = ({
    orgSlug,
    studyId,
    studyTitle,
    job,
    labName,
    lockedBanner,
    unlockedBanner,
    previousHref,
    allowDecisionWithoutArtifacts = false,
}) => {
    const { decryptedFiles, isLocked: isUndecrypted, onDecrypted } = useDecryptPhase()

    // Read from the job's own files, never from an empty fetchEncryptedJobFiles result, which
    // also returns [] with no registered key and would let decryption be skipped (OTTER-675).
    const requiresKey = !allowDecisionWithoutArtifacts || jobHasDecryptableRunOutcome(job.files ?? [])

    const isLocked = requiresKey && isUndecrypted
    // Non-null with no key step, which flips UnlockedPhase on so the reviewer goes straight to
    // the decision.
    const reviewableFiles = requiresKey ? decryptedFiles : NO_FILES
    // The unlocked banner warns about sharing outputs, so it is wrong when there are none.
    const banner = requiresKey && !isLocked ? unlockedBanner : lockedBanner
    // Same value as requiresKey, named separately so a later change to UnlockedPhase's null
    // guard cannot quietly turn "has a key step" into a sharing permission.
    const canShareOutputs = requiresKey

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader>Secondary analysis study</StudyPageHeader>
                <ProposalStepHeader
                    stepLabel="STEP 3"
                    heading="Review outputs"
                    studyTitle={studyTitle}
                    banner={banner}
                />
                <LockedPhase isVisible={isLocked} job={job} previousHref={previousHref} onDecrypted={onDecrypted} />
                <UnlockedPhase
                    decryptedFiles={reviewableFiles}
                    canShareOutputs={canShareOutputs}
                    orgSlug={orgSlug}
                    studyId={studyId}
                    job={job}
                    labName={labName}
                    previousHref={previousHref}
                />
            </Stack>
        </Box>
    )
}

type LockedPhaseProps = {
    isVisible: boolean
    job: NonNullable<LatestJobForStudy>
    previousHref: Route
    onDecrypted: (files: JobFileInfo[]) => void
}

const LockedPhase: FC<LockedPhaseProps> = ({ isVisible, job, previousHref, onDecrypted }) => {
    if (!isVisible) return null
    return (
        <>
            {/* Reviewers decrypt via the zip's embedded manifest and hold no re-wrapped per-file
                keys, so the researcher key set would come back empty. */}
            <SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />
            <Group>
                <PreviousStepLink previousHref={previousHref} />
            </Group>
        </>
    )
}

type UnlockedPhaseProps = {
    /** null until a key has successfully decrypted. */
    decryptedFiles: JobFileInfo[] | null
    /** False when the job has no artifacts, so there is no key step and nothing to share. */
    canShareOutputs: boolean
    orgSlug: string
    studyId: string
    job: NonNullable<LatestJobForStudy>
    labName: string
    previousHref: Route
}

// Split from the panel so mounting the collaborative editor and its websocket waits until
// decryption has happened.
const UnlockedPhase: FC<UnlockedPhaseProps> = ({
    decryptedFiles,
    canShareOutputs,
    orgSlug,
    studyId,
    job,
    labName,
    previousHref,
}) => {
    if (decryptedFiles === null) return null
    return (
        <ReviewBody
            decryptedFiles={decryptedFiles}
            canShareOutputs={canShareOutputs}
            orgSlug={orgSlug}
            studyId={studyId}
            job={job}
            labName={labName}
            previousHref={previousHref}
        />
    )
}

type ReviewBodyProps = Omit<UnlockedPhaseProps, 'decryptedFiles'> & { decryptedFiles: JobFileInfo[] }

// An empty "Outputs files" section would imply a complete listing of what the run produced.
const OutputsSection: FC<{ isVisible: boolean; jobId: string; decryptedFiles: JobFileInfo[] }> = ({
    isVisible,
    jobId,
    decryptedFiles,
}) => {
    if (!isVisible) return null
    return <OutputsFilesViewer jobId={jobId} decryptedFiles={decryptedFiles} />
}

const ReviewBody: FC<ReviewBodyProps> = ({
    decryptedFiles,
    canShareOutputs,
    orgSlug,
    studyId,
    job,
    labName,
    previousHref,
}) => {
    const decision = useOutputsDecision({ orgSlug, studyId, jobId: job.id, labName, decryptedFiles })

    return (
        <>
            <OutputsSection isVisible={canShareOutputs} jobId={job.id} decryptedFiles={decryptedFiles} />
            <OutputsDecisionSection
                jobId={job.id}
                studyId={studyId}
                labName={labName}
                characterCount={decision.characterCount}
                feedbackError={decision.feedbackError}
                onFeedbackChange={decision.onFeedbackChange}
                selected={decision.selected}
                onSelect={decision.onSelect}
                decisionError={decision.decisionError}
                canShareOutputs={canShareOutputs}
            />
            <Group justify="space-between">
                <PreviousStepLink previousHref={previousHref} />
                {/* Enabled from the start: pressing it is how the user learns what is still
                    missing, rather than facing a dead button with no explanation. */}
                <Button
                    onClick={decision.attemptSubmit}
                    disabled={decision.isSubmitting}
                    data-testid="outputs-submit-decision"
                >
                    Submit decision
                </Button>
            </Group>
            <SubmitOutputsDecisionModal
                decision={decision.confirming}
                labName={labName}
                isSubmitting={decision.isSubmitting}
                onClose={decision.closeModal}
                onConfirm={decision.confirmSubmit}
            />
        </>
    )
}
