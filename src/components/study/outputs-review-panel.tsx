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
    /**
     * Opt in to letting the reviewer decide when the job carries no encrypted artifact (OTTER-524).
     *
     * Only the errored screen sets this. For a completed run, no artifacts is not an expected
     * outcome but a sign that delivery went wrong, and skipping the key step there would quietly
     * present a broken hand-off as a reviewable one. For an errored run it is routine: a packaging
     * failure produces nothing, and AWS emits no container log when a task never starts.
     */
    allowDecisionWithoutArtifacts?: boolean
}

/**
 * The reviewer's outputs step, in its two phases.
 *
 * Decryption happens in the browser and changes no server state, so "advancing" to the review
 * view is a local phase flip, not a route change or a new screen: the study is still
 * JOB-ERRORED / RUN-COMPLETE either side of it. Holding both phases in one component is what
 * lets the decrypted plaintext stay in memory and never travel back to the server.
 *
 * The page and section headers are identical across both phases; only the banner below the
 * divider and the body beneath it change.
 */
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

    // OTTER-524: a run can fail without producing anything about its own outcome, and there is then
    // nothing for a key to open. The old flow left the reviewer stuck at the key form with no way to
    // record a decision, which in turn left the researcher on "code is running" forever.
    //
    // Read from the job's own files, NEVER from an empty result out of fetchEncryptedJobFilesAction:
    // that action also returns [] when the caller has no registered public key or when the fetch
    // failed, and treating those as "nothing to decrypt" would let a reviewer without a key skip
    // decryption entirely and decide on outputs they never saw. That is exactly the hole OTTER-675
    // closed. The predicate still covers every ENCRYPTED-RESULT, so no run's outputs can be decided
    // on unseen; it excludes only the submission-time security scan log, which no run produced.
    const requiresKey = !allowDecisionWithoutArtifacts || jobHasDecryptableRunOutcome(job.files ?? [])

    const isLocked = requiresKey && isUndecrypted
    // Non-null with no key step, which is what flips UnlockedPhase on: with nothing to decrypt the
    // reviewer goes straight to the decision, and there are no files to list.
    const reviewableFiles = requiresKey ? decryptedFiles : NO_FILES
    // Stays on the errored banner when there is nothing to decrypt: the unlocked banner warns about
    // sharing outputs, and there are none.
    const banner = requiresKey && !isLocked ? unlockedBanner : lockedBanner
    // The same value as requiresKey, named for the different question it answers: with no key step
    // nothing is ever decrypted, so there is nothing to share. Said here rather than left for the
    // reader to derive from UnlockedPhase's null guard two components away, so that a later change to
    // that guard cannot quietly turn "has a key step" into a sharing permission.
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
            {/* The reviewer decrypts via the zip's embedded manifest, which is encrypted to the
                enclave keys; they hold no re-wrapped per-file keys, so the researcher key set
                would come back empty. */}
            <SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />
            <Group>
                <PreviousStepLink previousHref={previousHref} />
            </Group>
        </>
    )
}

type UnlockedPhaseProps = {
    /** null until a key has successfully decrypted; the whole review view is gated on it. */
    decryptedFiles: JobFileInfo[] | null
    /** False when the job has no artifacts, so there is no key step and nothing to share. */
    canShareOutputs: boolean
    orgSlug: string
    studyId: string
    job: NonNullable<LatestJobForStudy>
    labName: string
    previousHref: Route
}

// Split from the panel so the hooks below run only once decryption has happened: mounting the
// collaborative editor (and its websocket) behind a still-locked key would be wasted work.
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

// No artifacts means no table to draw. Rendering an empty "Outputs files" section would imply the
// reviewer is looking at a complete listing of what the run produced.
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
                {/* Enabled from the start by design: pressing it is how the user learns what is
                    still missing, rather than being left with a dead button and no explanation. */}
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
