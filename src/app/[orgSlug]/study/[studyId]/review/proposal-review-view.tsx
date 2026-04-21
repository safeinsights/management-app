'use client'

import { AppModal } from '@/components/modal'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { useProposalReviewMutation } from '@/hooks/use-proposal-review-mutation'
import { useReviewDecision } from '@/hooks/use-review-decision'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { Routes } from '@/lib/routes'
import { Box, Button, Group, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import type { FC } from 'react'
import { ProposalSection } from './proposal-section'
import { ReviewDecisionSection } from './review-decision-section'
import { ReviewFeedbackSection } from './review-feedback-section'
import { ReviewProgressBar } from './review-progress-bar'
import { REVIEW_STEPS, type StudyForReview } from './review-types'

type ProposalReviewViewProps = {
    orgSlug: string
    study: StudyForReview
}

function useProposalReview({ orgSlug, studyId }: { orgSlug: string; studyId: string }) {
    const feedback = useReviewFeedback()
    const decision = useReviewDecision()
    const router = useRouter()
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)
    const [rejectOpen, { open: openReject, close: closeReject }] = useDisclosure(false)

    const canSubmit = feedback.isValid && decision.selected !== null
    const backPath = Routes.orgDashboard({ orgSlug })

    const { updateStudy, isPending } = useProposalReviewMutation({ studyId, orgSlug })

    const handleBack = () => {
        router.push(backPath)
    }

    const handleSubmit = () => {
        if (decision.selected === 'reject') {
            openReject()
        } else {
            openConfirm()
        }
    }

    const handleConfirmSubmit = () => {
        if (decision.selected === 'approve') {
            updateStudy('APPROVED')
            return
        }
        if (decision.selected === 'reject') {
            updateStudy('REJECTED')
            return
        }
        // TODO(OTTER-493): replace with submitProposalReviewAction({ decision: 'needs-clarification', feedback })
        // once the `proposal change requested` status and feedback storage land.
        closeConfirm()
        notifications.show({
            title: 'Not yet available',
            message: 'The "Needs clarification" flow will be enabled once backend work (OTTER-493) is complete.',
            color: 'blue',
        })
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
    if (study.status === 'APPROVED' || study.status === 'REJECTED') {
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

type SubmitReviewModalProps = {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isPending: boolean
}

const SubmitReviewModal: FC<SubmitReviewModalProps> = ({ isOpen, onClose, onConfirm, isPending }) => (
    <AppModal
        isOpen={isOpen}
        onClose={onClose}
        title="Confirm review submission?"
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
            <Group justify="flex-end">
                <Button variant="outline" onClick={onClose} disabled={isPending}>
                    Cancel
                </Button>
                <Button onClick={onConfirm} loading={isPending}>
                    Yes, submit review
                </Button>
            </Group>
        </Stack>
    </AppModal>
)

const RejectReviewModal: FC<SubmitReviewModalProps> = ({ isOpen, onClose, onConfirm, isPending }) => (
    <AppModal
        isOpen={isOpen}
        onClose={onClose}
        title="Reject initial request?"
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
            <Text size="md" fw={600} c="red.9">
                Rejection: This is intended as a last resort due to major, unresolvable issues and will end this study.
                This action cannot be undone.
            </Text>
            <Group justify="flex-end">
                <Button variant="outline" onClick={onClose} disabled={isPending}>
                    Cancel
                </Button>
                <Button color="red" onClick={onConfirm} loading={isPending}>
                    Reject initial request
                </Button>
            </Group>
        </Stack>
    </AppModal>
)

export function ProposalReviewView({ orgSlug, study }: ProposalReviewViewProps) {
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
    } = useProposalReview({ orgSlug, studyId: study.id })

    return (
        <Box bg="grey.10">
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

                <ReviewProgressBar currentStep={0} steps={REVIEW_STEPS} />
                <ProposalSection study={study} />
                <ReviewFeedbackSection feedback={feedback} />
                <ReviewDecisionSection decision={decision} study={study} labName={study.submittingLabName} />

                <ReviewActionsBar
                    study={study}
                    canSubmit={canSubmit}
                    isPending={isPending}
                    onBack={handleBack}
                    onSubmit={handleSubmit}
                />
            </Stack>

            <SubmitReviewModal
                isOpen={confirmOpen}
                onClose={closeConfirm}
                onConfirm={handleConfirmSubmit}
                isPending={isPending}
            />
            <RejectReviewModal
                isOpen={rejectOpen}
                onClose={closeReject}
                onConfirm={handleConfirmSubmit}
                isPending={isPending}
            />
        </Box>
    )
}
