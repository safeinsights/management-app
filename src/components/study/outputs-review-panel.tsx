'use client'

import { semanticColor } from '@/theme/tokens'
import { FC, ReactNode, useState } from 'react'
import { Box, Button, Stack } from '@mantine/core'
import { StudyAgreementPreparingNotice } from '@/components/legal/study-agreement-preparing-notice'
import { PoliteStatus } from '@/components/polite-status'
import { CodeRunCard } from '@/components/study/code-run-card'
import { CodeRunHistory, usePriorRunOutputs } from '@/components/study/code-run-history'
import { OutputsDecisionSection } from '@/components/study/outputs-decision-section'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { OutputsReviewSubmissionListener } from '@/components/study/outputs-review-submission-listener'
import { CodeRunKeyFields } from '@/components/study/code-run-key-form'
import { ProposalStepHeader, REVIEW_OUTPUTS_STEP } from '@/components/study/proposal-step-header'
import { StepNavigation } from '@/components/study/step-navigation'
import { SubmitOutputsDecisionModal } from '@/components/study/submit-outputs-decision-modal'
import { useDecryptPhase } from '@/hooks/use-decrypt-phase'
import { useOutputsDecision } from '@/hooks/use-outputs-decision'
import { StudyKickOutProvider } from '@/hooks/use-study-status-on-reconnect'
import { OutputsReviewFeedbackProviderShare } from '@/lib/realtime/outputs-review-feedback-provider-context'
import { jobHasDecryptableRunOutcome } from '@/lib/file-type-helpers'
import { hasOutputsDecision, isOutputsReviewEditable, OUTPUTS_DECIDED_NOTICE } from '@/lib/outputs-review'
import type { PhasedStepNav } from '@/lib/study-screen'
import type { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy, PriorCodeRun } from '@/server/db/queries'

// Module-level so the no-key path hands the same array identity down on every render.
const NO_FILES: JobFileInfo[] = []

type OutputsReviewPanelProps = {
    orgSlug: string
    studyId: string
    job: NonNullable<LatestJobForStudy>
    priorRuns: PriorCodeRun[]
    labName: string
    /** The page header, built by the screen from the study, so the h1 fallback lives in one place. */
    header: ReactNode
    /** Shown while the outputs are still encrypted (OTTER-667 / OTTER-668 copy). */
    lockedBanner: ReactNode
    /** Replaces it once the key decrypts, warning the reviewer to check before sharing. */
    unlockedBanner: ReactNode
    /** Locked keeps only "Previous step": the key form's View button is the forward action until
     * decryption, after which "Submit decision" in the Decision card is. */
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
    priorRuns,
    labName,
    header,
    lockedBanner,
    unlockedBanner,
    nav,
    allowDecisionWithoutArtifacts = false,
}) => {
    const { decryptedFiles, isLocked: isUndecrypted, onDecrypted } = useDecryptPhase()
    const priorOutputs = usePriorRunOutputs(priorRuns)
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
                        <ProposalStepHeader
                            stepLabel={REVIEW_OUTPUTS_STEP.label}
                            heading={REVIEW_OUTPUTS_STEP.heading}
                            banner={banner}
                        />
                        <StudyAgreementPreparingNotice
                            studyId={studyId}
                            consequence="You cannot release these outputs"
                        />
                        <LatestRunCard
                            isVisible={requiresKey}
                            job={job}
                            decryptedFiles={reviewableFiles}
                            onDecrypted={onDecrypted}
                            onKeyAccepted={priorOutputs.decryptWith}
                        />
                        <UnlockedPhase
                            decryptedFiles={reviewableFiles}
                            canShareOutputs={canShareOutputs}
                            orgSlug={orgSlug}
                            studyId={studyId}
                            job={job}
                            labName={labName}
                            tabSessionId={tabSessionId}
                        />
                        {/* After both phases rather than inside either, so decrypting does not remount
                            the history and drop what the reviewer had opened. */}
                        <CodeRunHistory runs={priorRuns} outputs={priorOutputs} isLatestDecrypted={!isLocked} />
                        <PoliteStatus announcement={priorOutputs.announcement} />
                        <StepNavigation nav={isLocked ? nav.locked : nav.unlocked} />
                    </Stack>
                </Box>
            </OutputsReviewFeedbackProviderShare>
        </StudyKickOutProvider>
    )
}

type LatestRunSectionProps = {
    job: NonNullable<LatestJobForStudy>
    /** null until a key has successfully decrypted. */
    decryptedFiles: JobFileInfo[] | null
    onDecrypted: (files: JobFileInfo[]) => void
    onKeyAccepted: (privateKey: string) => void
}

const LatestRunSection: FC<LatestRunSectionProps> = ({ job, decryptedFiles, onDecrypted, onKeyAccepted }) => {
    if (decryptedFiles === null) {
        return (
            <CodeRunKeyFields
                job={job}
                description="Output files are encrypted. Enter your security key to access outputs from this and previous code runs."
                onDecrypted={onDecrypted}
                onKeyAccepted={onKeyAccepted}
            />
        )
    }
    // Mounts only once the reviewer's key has decrypted, so it takes the focus the key form held.
    return <OutputsFilesViewer jobId={job.id} decryptedFiles={decryptedFiles} variant="embedded" autoFocusTitle />
}

// The card stays across decryption, so the run's header does not drop when the key form gives way
// to the outputs. Hidden with no key step, since the card would have nothing to hold.
const LatestRunCard: FC<LatestRunSectionProps & { isVisible: boolean }> = ({ isVisible, ...props }) => {
    if (!isVisible) return null
    return (
        <CodeRunCard job={props.job}>
            <LatestRunSection {...props} />
        </CodeRunCard>
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
            tabSessionId={tabSessionId}
        />
    )
}

type ReviewBodyProps = Omit<UnlockedPhaseProps, 'decryptedFiles'> & { decryptedFiles: JobFileInfo[] }

const ReviewBody: FC<ReviewBodyProps> = ({
    decryptedFiles,
    canShareOutputs,
    orgSlug,
    studyId,
    job,
    labName,
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
                submitAction={
                    // Enabled from the start: pressing it is how the user learns what is still missing,
                    // rather than facing a dead button with no explanation.
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
