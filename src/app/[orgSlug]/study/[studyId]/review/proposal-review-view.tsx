'use client'

import { AppModal } from '@/components/modal'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { useProposalCollaborationFeatureFlag } from '@/components/openstax-feature-flag'
import { useProposalReviewMutation } from '@/hooks/use-proposal-review-mutation'
import { useReviewDecision } from '@/hooks/use-review-decision'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { StudyKickOutProvider } from '@/hooks/use-study-status-on-reconnect'
import { isSubmittedProposalReviewStatus } from '@/lib/proposal-review'
import { Routes } from '@/lib/routes'
import { ReviewSubmissionListener } from './review-submission-listener'
import { Box, Button, Group, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useState, type FC, type ReactNode } from 'react'
import { ProposalSection } from './proposal-section'
import { ReviewDecisionSection } from './review-decision-section'
import { ReviewFeedbackSection } from './review-feedback-section'
import { type StudyForReview } from './review-types'

const REVIEW_EDITABLE_STATUSES = ['PENDING-REVIEW'] as const

type ProposalReviewViewProps = {
    orgSlug: string
    study: StudyForReview
}

function useProposalReview({
    orgSlug,
    studyId,
    tabSessionId,
}: {
    orgSlug: string
    studyId: string
    tabSessionId: string
}) {
    const feedback = useReviewFeedback()
    const decision = useReviewDecision()
    const router = useRouter()
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)
    const [rejectOpen, { open: openReject, close: closeReject }] = useDisclosure(false)

    const canSubmit = feedback.isValid && decision.selected !== null
    const backPath = Routes.orgDashboard({ orgSlug })

    const { submitReview, isPending } = useProposalReviewMutation({ studyId, orgSlug, tabSessionId })

    const handleBack = () => {
        router.push(backPath)
    }

    const handleSubmit = () => {
        if (decision.selected === null) {
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
        canSubmit,
        handleBack,
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
    canSubmit: boolean
    isPending: boolean
    onBack: () => void
    onSubmit: () => void
}

const ReviewActionsBar: FC<ReviewActionsBarProps> = ({ study, canSubmit, isPending, onBack, onSubmit }) => {
    if (isSubmittedProposalReviewStatus(study.status)) {
        return null
    }
    return (
        <Group justify="space-between">
            <Button variant="subtle" leftSection={<CaretLeftIcon />} onClick={onBack}>
                Back
            </Button>
            <Button disabled={!canSubmit || isPending} onClick={onSubmit}>
                Submit review
            </Button>
        </Group>
    )
}

type ReviewConfirmationModalProps = {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isPending: boolean
    title: string
    confirmLabel: string
    variant?: 'default' | 'destructive'
    warning?: ReactNode
}

const REJECTION_WARNING = (
    <Text size="md" fw={600} c="red.9">
        Rejection: This is intended as a last resort due to major, unresolvable issues and will end this study. This
        action cannot be undone.
    </Text>
)

const ReviewConfirmationModal: FC<ReviewConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    isPending,
    title,
    confirmLabel,
    variant = 'default',
    warning,
}) => {
    const isDestructive = variant === 'destructive'
    return (
        <AppModal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size={720}
            closeOnClickOutside={!isPending}
            closeOnEscape={!isPending}
            withCloseButton={!isPending}
        >
            <Stack>
                <Text size="md">
                    Please confirm you are ready to submit your review. Other teammates may still be working on it and
                    further edits are not permitted once submitted.
                </Text>
                {warning}
                <Group justify="flex-end">
                    <Button variant="outline" onClick={onClose} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button color={isDestructive ? 'red' : undefined} onClick={onConfirm} loading={isPending}>
                        {confirmLabel}
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}

export function ProposalReviewView({ orgSlug, study }: ProposalReviewViewProps) {
    // One id per mount of the review view. Shared between the broadcaster (mutation
    // hook) and the listener so the broadcaster's own tab is the only one that skips
    // the kick-out flow. Same-user other tabs get fresh ids and respond as expected.
    const [tabSessionId] = useState(() => crypto.randomUUID())

    const {
        feedback,
        decision,
        canSubmit,
        handleBack,
        handleSubmit,
        confirmOpen,
        closeConfirm,
        rejectOpen,
        closeReject,
        handleConfirmSubmit,
        isPending,
    } = useProposalReview({ orgSlug, studyId: study.id, tabSessionId })
    const isCollaborationEnabled = useProposalCollaborationFeatureFlag()
    const isEditable = !isSubmittedProposalReviewStatus(study.status)

    return (
        <StudyKickOutProvider
            studyId={study.id}
            orgSlug={orgSlug}
            editableStatuses={REVIEW_EDITABLE_STATUSES}
            redirectTarget="studyReview"
            enabled={isCollaborationEnabled && isEditable}
        >
            <Box bg="grey.10">
                <ReviewSubmissionListener
                    orgSlug={orgSlug}
                    studyId={study.id}
                    tabSessionId={tabSessionId}
                    enabled={isCollaborationEnabled && isEditable}
                />
                <Stack px="xl" gap="xl" py="xl">
                    <PageBreadcrumbs
                        crumbs={[
                            ['Dashboard', Routes.orgDashboard({ orgSlug })],
                            ['Data use request', Routes.studyReview({ orgSlug, studyId: study.id })],
                            ['Review initial request'],
                        ]}
                    />

                    <Title order={1} fz={40} fw={700}>
                        Review initial request
                    </Title>

                    <ProposalSection study={study} orgSlug={orgSlug} />
                    <ReviewFeedbackSection
                        feedback={feedback}
                        submittingLabName={study.submittingLabName}
                        studyId={study.id}
                    />
                    <ReviewDecisionSection decision={decision} study={study} labName={study.submittingLabName} />

                    <ReviewActionsBar
                        study={study}
                        canSubmit={canSubmit}
                        isPending={isPending}
                        onBack={handleBack}
                        onSubmit={handleSubmit}
                    />
                </Stack>

                <ReviewConfirmationModal
                    isOpen={confirmOpen}
                    onClose={closeConfirm}
                    onConfirm={handleConfirmSubmit}
                    isPending={isPending}
                    title="Confirm review submission?"
                    confirmLabel="Yes, submit review"
                />
                <ReviewConfirmationModal
                    isOpen={rejectOpen}
                    onClose={closeReject}
                    onConfirm={handleConfirmSubmit}
                    isPending={isPending}
                    title="Reject initial request?"
                    confirmLabel="Reject initial request"
                    variant="destructive"
                    warning={REJECTION_WARNING}
                />
            </Box>
        </StudyKickOutProvider>
    )
}
