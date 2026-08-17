'use client'

import { FC, ReactNode, useState } from 'react'
import type { Route } from 'next'
import { Box, Button, Group, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import { OutputsDecisionSection } from '@/components/study/outputs-decision-section'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { SubmitOutputsDecisionModal } from '@/components/study/submit-outputs-decision-modal'
import { useOutputsDecision } from '@/hooks/use-outputs-decision'
import type { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'

type OutputsReviewPanelProps = {
    orgSlug: string
    studyId: string
    studyTitle: string
    job: NonNullable<LatestJobForStudy>
    labName: string
    maxWords: number
    /** Shown while the outputs are still encrypted (OTTER-667 / OTTER-668 copy). */
    lockedBanner: ReactNode
    /** Replaces it once the key decrypts, warning the reviewer to check before sharing. */
    unlockedBanner: ReactNode
    previousHref: Route
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
    maxWords,
    lockedBanner,
    unlockedBanner,
    previousHref,
}) => {
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[] | null>(null)
    const isLocked = decryptedFiles === null
    const banner = isLocked ? lockedBanner : unlockedBanner

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
                <LockedPhase
                    isVisible={isLocked}
                    job={job}
                    previousHref={previousHref}
                    onDecrypted={setDecryptedFiles}
                />
                <UnlockedPhase
                    decryptedFiles={decryptedFiles}
                    orgSlug={orgSlug}
                    studyId={studyId}
                    job={job}
                    labName={labName}
                    maxWords={maxWords}
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

const PreviousStepLink: FC<{ previousHref: Route }> = ({ previousHref }) => (
    <ButtonLink href={previousHref} variant="subtle" leftSection={<CaretLeftIcon />}>
        Previous step
    </ButtonLink>
)

type UnlockedPhaseProps = {
    /** null until a key has successfully decrypted; the whole review view is gated on it. */
    decryptedFiles: JobFileInfo[] | null
    orgSlug: string
    studyId: string
    job: NonNullable<LatestJobForStudy>
    labName: string
    maxWords: number
    previousHref: Route
}

// Split from the panel so the hooks below run only once decryption has happened: mounting the
// collaborative editor (and its websocket) behind a still-locked key would be wasted work.
const UnlockedPhase: FC<UnlockedPhaseProps> = ({
    decryptedFiles,
    orgSlug,
    studyId,
    job,
    labName,
    maxWords,
    previousHref,
}) => {
    if (decryptedFiles === null) return null
    return (
        <ReviewBody
            decryptedFiles={decryptedFiles}
            orgSlug={orgSlug}
            studyId={studyId}
            job={job}
            labName={labName}
            maxWords={maxWords}
            previousHref={previousHref}
        />
    )
}

type ReviewBodyProps = Omit<UnlockedPhaseProps, 'decryptedFiles'> & { decryptedFiles: JobFileInfo[] }

const ReviewBody: FC<ReviewBodyProps> = ({
    decryptedFiles,
    orgSlug,
    studyId,
    job,
    labName,
    maxWords,
    previousHref,
}) => {
    const decision = useOutputsDecision({ orgSlug, studyId, jobId: job.id, labName, maxWords, decryptedFiles })

    return (
        <>
            <OutputsFilesViewer jobId={job.id} decryptedFiles={decryptedFiles} />
            <OutputsDecisionSection
                jobId={job.id}
                studyId={studyId}
                labName={labName}
                maxWords={maxWords}
                wordCount={decision.wordCount}
                feedbackError={decision.feedbackError}
                onFeedbackChange={decision.onFeedbackChange}
                selected={decision.selected}
                onSelect={decision.onSelect}
                decisionError={decision.decisionError}
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
