'use client'

import { ReviewConfirmationModal, REJECTION_WARNING } from '@/components/modals/review-confirmation-modal'
import { useProposalReviewMutation } from '@/hooks/use-proposal-review-mutation'
import { useReviewDecision } from '@/hooks/use-review-decision'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { StudyKickOutProvider } from '@/hooks/use-study-status-on-reconnect'
import { ReviewFeedbackProviderShare } from '@/lib/realtime/review-feedback-provider-context'
import { isSubmittedProposalReviewStatus } from '@/lib/proposal-review'
import { ReviewSubmissionListener } from './review-submission-listener'
import { ProposalReviewLayoutView } from './proposal-review-layout-view'
import { Button, Group, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useState, type FC } from 'react'
import type { ProposalFeedbackEntry } from '@/server/actions/study.actions'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalSection } from './proposal-section'
import { ReviewDecisionSection } from './review-decision-section'
import { ReviewFeedbackSection } from './review-feedback-section'
import { type StudyForReview } from './review-types'

const REVIEW_EDITABLE_STATUSES = ['PENDING-REVIEW'] as const

type ProposalReviewViewProps = {
    orgSlug: string
    study: StudyForReview
    priorEntries: ProposalFeedbackEntry[]
    reviewVersion: number
}

function useProposalReview({
    orgSlug,
    studyId,
    tabSessionId,
    reviewVersion,
    submittingLabName,
}: {
    orgSlug: string
    studyId: string
    tabSessionId: string
    reviewVersion: number
    submittingLabName: string
}) {
    const feedback = useReviewFeedback(`Enter your decision for ${submittingLabName} before submitting.`)
    const decision = useReviewDecision()
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)
    const [rejectOpen, { open: openReject, close: closeReject }] = useDisclosure(false)

    const { submitReview, isPending } = useProposalReviewMutation({ studyId, orgSlug, tabSessionId, reviewVersion })

    const handleSubmit = async () => {
        const feedbackError = await feedback.onBlur()
        const decisionError = await decision.onBlur()

        if (feedbackError || !feedback.isValid || decisionError || decision.selected === null) {
            return
        }

        if (decision.selected === 'reject') {
            openReject()
        } else {
            openConfirm()
        }
    }

    const handleConfirmSubmit = () => {
        if (decision.selected === null) {
            return
        }
        submitReview({ decision: decision.selected, feedback: feedback.value })
    }

    return {
        feedback,
        decision,
        handleSubmit,
        confirmOpen,
        closeConfirm,
        rejectOpen,
        closeReject,
        handleConfirmSubmit,
        isPending,
    }
}

type ReviewActionsBarProps = {
    study: StudyForReview
    isPending: boolean
    onSubmit: () => void
}

const ReviewActionsBar: FC<ReviewActionsBarProps> = ({ study, isPending, onSubmit }) => {
    if (isSubmittedProposalReviewStatus(study.status)) {
        return null
    }
    return (
        <Group justify="flex-end">
            <Button disabled={isPending} onClick={onSubmit}>
                Submit decision
            </Button>
        </Group>
    )
}

const CONFIRM_BODY =
    'Please confirm you are ready to submit your review. Further edits are not permitted once submitted.'

/**
 * Inner component that does all the hook work. Lives **inside**
 * `<ReviewFeedbackProviderShare>` so `useProposalReviewMutation` can read the
 * editor's published `HocuspocusProvider` via `useReviewFeedbackProvider()`.
 * Without this split the mutation hook would call `useReviewFeedbackProvider`
 * from a tree position above the share context provider and throw.
 */
function ProposalReviewViewContent({ orgSlug, study, priorEntries, reviewVersion }: ProposalReviewViewProps) {
    // One id per mount of the review view. Shared between the broadcaster (mutation
    // hook) and the listener so the broadcaster's own tab is the only one that skips
    // the kick-out flow. Same-user other tabs get fresh ids and respond as expected.
    const [tabSessionId] = useState(() => crypto.randomUUID())

    const {
        feedback,
        decision,
        handleSubmit,
        confirmOpen,
        closeConfirm,
        rejectOpen,
        closeReject,
        handleConfirmSubmit,
        isPending,
    } = useProposalReview({
        orgSlug,
        studyId: study.id,
        tabSessionId,
        reviewVersion,
        submittingLabName: study.submittingLabName,
    })
    const isEditable = !isSubmittedProposalReviewStatus(study.status)

    return (
        <ProposalReviewLayoutView
            listener={
                <ReviewSubmissionListener
                    orgSlug={orgSlug}
                    studyId={study.id}
                    tabSessionId={tabSessionId}
                    enabled={isEditable}
                />
            }
            proposal={
                <ProposalSection
                    study={study}
                    orgSlug={orgSlug}
                    priorEntries={priorEntries}
                    reviewVersion={reviewVersion}
                />
            }
            feedbackAndNotes={<FeedbackAndNotesSection entries={priorEntries} />}
            feedback={
                <ReviewFeedbackSection
                    feedback={feedback}
                    submittingLabName={study.submittingLabName}
                    studyId={study.id}
                    reviewVersion={reviewVersion}
                />
            }
            decision={<ReviewDecisionSection decision={decision} study={study} labName={study.submittingLabName} />}
            actions={<ReviewActionsBar study={study} isPending={isPending} onSubmit={handleSubmit} />}
            modals={
                <>
                    <ReviewConfirmationModal
                        isOpen={confirmOpen}
                        onClose={closeConfirm}
                        onConfirm={handleConfirmSubmit}
                        isPending={isPending}
                        title="Confirm review submission?"
                        confirmLabel="Yes, submit review"
                    >
                        <Text size="md">{CONFIRM_BODY}</Text>
                    </ReviewConfirmationModal>
                    <ReviewConfirmationModal
                        isOpen={rejectOpen}
                        onClose={closeReject}
                        onConfirm={handleConfirmSubmit}
                        isPending={isPending}
                        title="Reject initial request"
                        confirmLabel="Reject initial request"
                        variant="destructive"
                    >
                        <Text size="md">{CONFIRM_BODY}</Text>
                        {REJECTION_WARNING}
                    </ReviewConfirmationModal>
                </>
            }
        />
    )
}

export function ProposalReviewView(props: ProposalReviewViewProps) {
    const isEditable = !isSubmittedProposalReviewStatus(props.study.status)

    return (
        <StudyKickOutProvider
            studyId={props.study.id}
            orgSlug={props.orgSlug}
            editableStatuses={REVIEW_EDITABLE_STATUSES}
            redirectTarget="studyReview"
            enabled={isEditable}
        >
            <ReviewFeedbackProviderShare>
                <ProposalReviewViewContent {...props} />
            </ReviewFeedbackProviderShare>
        </StudyKickOutProvider>
    )
}
