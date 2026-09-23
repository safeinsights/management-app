'use client'

import { semanticColor } from '@/theme/tokens'
import { FC, ReactNode, useState } from 'react'
import { Box, Button, Stack } from '@mantine/core'
import { StudyAgreementPreparingNotice } from '@/components/legal/study-agreement-preparing-notice'
import { OutputsDecisionSection } from '@/components/study/outputs-decision-section'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { OutputsReviewSubmissionListener } from '@/components/study/outputs-review-submission-listener'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { StepNavigation } from '@/components/study/step-navigation'
import { SubmitOutputsDecisionModal } from '@/components/study/submit-outputs-decision-modal'
import { useDecryptPhase } from '@/hooks/use-decrypt-phase'
import { useOutputsDecision } from '@/hooks/use-outputs-decision'
import { StudyKickOutProvider } from '@/hooks/use-study-status-on-reconnect'
import { OutputsReviewFeedbackProviderShare } from '@/lib/realtime/outputs-review-feedback-provider-context'
import { jobHasDecryptableRunOutcome } from '@/lib/file-type-helpers'
import { hasOutputsDecision, isOutputsReviewEditable, OUTPUTS_DECIDED_NOTICE } from '@/lib/outputs-review'
import type { PhasedStepNav, StepNav } from '@/lib/study-screen'
import type { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'

// Module-level so the no-key path hands the same array identity down on every render.
const NO_FILES: JobFileInfo[] = []

type OutputsReviewPanelProps = {
    orgSlug: string
    studyId: string
    job: NonNullable<LatestJobForStudy>
    labName: string
    /** The page header, built by the screen from the study, so the h1 fallback lives in one place. */
    header: ReactNode
    /** Shown while the outputs are still encrypted (OTTER-667 / OTTER-668 copy). */
    lockedBanner: ReactNode
    /** Replaces it once the key decrypts, warning the reviewer to check before sharing. */
    unlockedBanner: ReactNode
    /** Locked keeps only "Previous step": the key form's View button is the forward action until
     * decryption, after which "Submit decision" is. */
    nav: PhasedStepNav
    /** Only the errored screen sets this: for a completed run, no artifacts means delivery
     * went wrong, so the key step must not be skipped (OTTER-524). */
    allowDecisionWithoutArtifacts?: boolean
}

// Both phases live in one component so the decrypted plaintext stays in memory and never
// reaches the server; advancing is a local flip, not a route change.
export const OutputsReviewPanel: FC<OutputsReviewPanelProps> = ({
    orgSlug,
    studyId,
    job,
    labName,
    header,
    lockedBanner,
    unlockedBanner,
    nav,
    allowDecisionWithoutArtifacts = false,
}) => {
    const { decryptedFiles, isLocked: isUndecrypted, onDecrypted } = useDecryptPhase()
    // Identifies this tab to the peers, so the same reviewer's other tabs are still closed out.
    const [tabSessionId] = useState(() => crypto.randomUUID())
    const isRoundOpen = !hasOutputsDecision((job.statusChanges ?? []).map((change) => change.status))

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

    // Both wrappers sit above the locked/unlocked split, so a reviewer who has not yet entered
    // their security key is closed out of a decided round as well.
    return (
        <StudyKickOutProvider
            studyId={studyId}
            studyJobId={job.id}
            orgSlug={orgSlug}
            editableStatuses={[]}
            isEditable={isOutputsReviewEditable}
            redirectTarget="studyReview"
            notice={OUTPUTS_DECIDED_NOTICE}
            enabled={isRoundOpen}
        >
            <OutputsReviewFeedbackProviderShare>
                <OutputsReviewSubmissionListener
                    orgSlug={orgSlug}
                    studyId={studyId}
                    tabSessionId={tabSessionId}
                    enabled={isRoundOpen}
                />
                <Box bg={semanticColor('surface.page')}>
                    <Stack px="xl" gap="xxl" py="xl">
                        {header}
                        <ProposalStepHeader stepLabel="STEP 3" heading="Review outputs" banner={banner} />
                        <StudyAgreementPreparingNotice
                            studyId={studyId}
                            consequence="You cannot release these outputs"
                        />
                        <LockedPhase isVisible={isLocked} job={job} nav={nav.locked} onDecrypted={onDecrypted} />
                        <UnlockedPhase
                            decryptedFiles={reviewableFiles}
                            canShareOutputs={canShareOutputs}
                            orgSlug={orgSlug}
                            studyId={studyId}
                            job={job}
                            labName={labName}
                            nav={nav.unlocked}
                            tabSessionId={tabSessionId}
                        />
                    </Stack>
                </Box>
            </OutputsReviewFeedbackProviderShare>
        </StudyKickOutProvider>
    )
}

type LockedPhaseProps = {
    isVisible: boolean
    job: NonNullable<LatestJobForStudy>
    nav: StepNav
    onDecrypted: (files: JobFileInfo[]) => void
}

const LockedPhase: FC<LockedPhaseProps> = ({ isVisible, job, nav, onDecrypted }) => {
    if (!isVisible) return null
    return (
        <>
            {/* Reviewers decrypt via the zip's embedded manifest and hold no re-wrapped per-file
                keys, so the researcher key set would come back empty. */}
            <SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />
            <StepNavigation nav={nav} />
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
    nav: StepNav
    tabSessionId: string
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
    nav,
    tabSessionId,
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
            nav={nav}
            tabSessionId={tabSessionId}
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
    nav,
    tabSessionId,
}) => {
    const decision = useOutputsDecision({
        orgSlug,
        studyId,
        jobId: job.id,
        labName,
        decryptedFiles,
        tabSessionId,
    })

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
            {/* Enabled from the start: pressing it is how the user learns what is still missing,
                rather than facing a dead button with no explanation. */}
            <StepNavigation
                nav={nav}
                formAction={
                    <Button
                        size="md"
                        onClick={decision.attemptSubmit}
                        disabled={decision.isSubmitting}
                        data-testid="outputs-submit-decision"
                    >
                        Submit decision
                    </Button>
                }
            />
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
