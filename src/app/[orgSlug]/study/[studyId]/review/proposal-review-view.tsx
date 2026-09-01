'use client'

import { useProposalReviewMutation } from '@/hooks/use-proposal-review-mutation'
import { useReviewDecision } from '@/hooks/use-review-decision'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { StudyKickOutProvider } from '@/hooks/use-study-status-on-reconnect'
import { ReviewFeedbackProviderShare } from '@/lib/realtime/review-feedback-provider-context'
import { isSubmittedProposalReviewStatus } from '@/lib/proposal-review'
import { ReviewSubmissionListener } from './review-submission-listener'
import { ProposalReviewLayoutView } from './proposal-review-layout-view'
import { DecisionConfirmationModal } from './decision-confirmation-modal'
import { Button, Group } from '@mantine/core'
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
    const [modalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)

    const { submitReview, isPending } = useProposalReviewMutation({ studyId, orgSlug, tabSessionId, reviewVersion })

    const handleSubmit = async () => {
        const feedbackError = await feedback.onBlur()
        const decisionError = await decision.onBlur()

        if (feedbackError || !feedback.isValid || decisionError || decision.selected === null) {
            return
        }

        openModal()
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
        modalOpen,
        closeModal,
        handleConfirmSubmit,
        isPending,
    }
}

type ReviewActionsBarProps = {
    study: StudyForReview
    onSubmit: () => void
}

const ReviewActionsBar: FC<ReviewActionsBarProps> = ({ study, onSubmit }) => {
    if (isSubmittedProposalReviewStatus(study.status)) {
        return null
    }
    return (
        <Group justify="flex-end">
            <Button onClick={onSubmit}>Submit decision</Button>
        </Group>
    )
}

// Lives inside <ReviewFeedbackProviderShare> so useProposalReviewMutation can reach the editor's
// HocuspocusProvider; without the split it would call the hook above its provider and throw.
function ProposalReviewViewContent({ orgSlug, study, priorEntries, reviewVersion }: ProposalReviewViewProps) {
    // One id per mount, shared by broadcaster and listener so only the broadcasting tab skips the
    // kick-out flow.
    const [tabSessionId] = useState(() => crypto.randomUUID())

    const { feedback, decision, handleSubmit, modalOpen, closeModal, handleConfirmSubmit, isPending } =
        useProposalReview({
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
            actions={<ReviewActionsBar study={study} onSubmit={handleSubmit} />}
            modals={
                <DecisionConfirmationModal
                    decision={decision.selected}
                    labName={study.submittingLabName}
                    isOpen={modalOpen}
                    onClose={closeModal}
                    onConfirm={handleConfirmSubmit}
                    isPending={isPending}
                />
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
