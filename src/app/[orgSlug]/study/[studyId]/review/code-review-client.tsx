'use client'

import { useState, type FC, type ReactNode } from 'react'
import { Alert, Box, Button, Group, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { CaretLeftIcon } from '@phosphor-icons/react'

import { AppModal } from '@/components/modal'
import { useCodeReviewCollaborationFeatureFlag } from '@/components/openstax-feature-flag'
import { useCodeReviewMutation } from '@/hooks/use-code-review-mutation'
import { useReviewDecision } from '@/hooks/use-review-decision'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { StudyKickOutProvider, type EditableSnapshot } from '@/hooks/use-study-status-on-reconnect'
import { CodeReviewFeedbackProviderShare } from '@/lib/realtime/code-review-feedback-provider-context'
import { REVIEWABLE_CODE_JOB_STATUSES } from '@/lib/code-review-status'
import { CODE_REVIEW_FEEDBACK_MAX_WORDS } from '@/lib/proposal-review'
import type { Decision } from '@/lib/review-decision'
import { Routes } from '@/lib/routes'
import type { SelectedStudy } from '@/server/actions/study.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { StudyJobStatus } from '@/database/types'
import { StudyCodeDetails } from '@/components/study/study-code-details'

import { CodeEvaluationSection } from './code-evaluation-section'
import { CodeReviewFeedbackSection } from './code-review-feedback-section'
import { CodeReviewSubmissionListener } from './code-review-submission-listener'
import { CODE_REVIEW_CRITERIA_KEYS } from '@/hooks/use-code-review-evaluation-map'
import type { CodeReviewCriteria, CodeReviewCriteriaDraft } from '@/hooks/use-code-review-evaluation-map'

type Props = {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    latestJobStatus: StudyJobStatus | null
}

const isCodeReviewEditable = ({ status, latestJobStatus }: EditableSnapshot): boolean =>
    status === 'PENDING-REVIEW' && latestJobStatus !== null && REVIEWABLE_CODE_JOB_STATUSES.includes(latestJobStatus)

const CONFIRM_BODY =
    'Please confirm you are ready to submit this code review. Further edits are not permitted once submitted.'

const REJECTION_WARNING = (
    <Text size="md" fw={600} c="red.9">
        Rejection: This is intended as a last resort due to major, unresolvable issues and will end this study. This
        action cannot be undone.
    </Text>
)

const allCriteriaAnswered = (draft: CodeReviewCriteriaDraft): draft is CodeReviewCriteria =>
    CODE_REVIEW_CRITERIA_KEYS.every((key) => draft[key] !== null)

function useCodeReview({
    orgSlug,
    studyId,
    jobId,
    tabSessionId,
}: {
    orgSlug: string
    studyId: string
    jobId: string
    tabSessionId: string
}) {
    const feedback = useReviewFeedback({ maxWords: CODE_REVIEW_FEEDBACK_MAX_WORDS })
    const decision = useReviewDecision()
    const router = useRouter()
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)
    const [rejectOpen, { open: openReject, close: closeReject }] = useDisclosure(false)

    const evaluationForm = useForm<{ criteria: CodeReviewCriteriaDraft }>({
        initialValues: {
            criteria: {
                proposalAlignment: null,
                agreementCompliance: null,
                securityChecks: null,
                privacyProtection: null,
            },
        },
    })

    const criteriaDraft = evaluationForm.getValues().criteria
    const criteriaComplete = allCriteriaAnswered(criteriaDraft)
    const hasDecision = decision.selected !== null

    const canSubmit = feedback.isValid && hasDecision && criteriaComplete
    const backPath = Routes.orgDashboard({ orgSlug })

    const { submitReview, isPending } = useCodeReviewMutation({ studyId, jobId, orgSlug, tabSessionId })

    const handleBack = () => {
        router.push(backPath)
    }

    const handleSubmit = () => {
        if (!hasDecision) return

        if (decision.selected === 'reject') {
            openReject()
        } else {
            openConfirm()
        }
    }

    const handleConfirmSubmit = () => {
        if (decision.selected === null) return
        if (!allCriteriaAnswered(criteriaDraft)) return
        submitReview({
            decision: decision.selected,
            feedback: feedback.value,
            criteria: criteriaDraft,
        })
    }

    return {
        feedback,
        decision,
        evaluationForm,
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

type ConfirmationModalProps = {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isPending: boolean
    title: string
    confirmLabel: string
    variant?: 'default' | 'destructive'
    bodyParagraphs: ReactNode
}

const ConfirmationModal: FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    isPending,
    title,
    confirmLabel,
    variant = 'default',
    bodyParagraphs,
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
                {bodyParagraphs}
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

const DEFAULT_MODAL_BODY = <Text size="md">{CONFIRM_BODY}</Text>

const REJECT_MODAL_BODY = (
    <>
        <Text size="md">{CONFIRM_BODY}</Text>
        {REJECTION_WARNING}
    </>
)

type EditableBodyProps = {
    isVisible: boolean
    feedback: ReturnType<typeof useReviewFeedback>
    evaluationForm: ReturnType<typeof useCodeReview>['evaluationForm']
    decision: ReturnType<typeof useReviewDecision>
    job: LatestJobForStudy
    labName: string
    canSubmit: boolean
    isPending: boolean
    onBack: () => void
    onSubmit: () => void
    onDecisionChange: (next: Decision) => void
}

function EditableBody({
    isVisible,
    feedback,
    evaluationForm,
    decision,
    job,
    labName,
    canSubmit,
    isPending,
    onBack,
    onSubmit,
    onDecisionChange,
}: EditableBodyProps) {
    if (!isVisible) return null
    return (
        <Stack gap="xl">
            <Box bg="white" p="xxl">
                <StudyCodeDetails job={job} />
            </Box>
            <CodeEvaluationSection form={evaluationForm} enabled />
            <CodeReviewFeedbackSection
                feedback={feedback}
                studyId={job.studyId}
                jobId={job.id}
                decisionValue={decision.selected}
                onDecisionChange={onDecisionChange}
                labName={labName}
            />
            <Group justify="space-between">
                <Button variant="subtle" leftSection={<CaretLeftIcon />} onClick={onBack}>
                    Back
                </Button>
                <Button disabled={!canSubmit || isPending} onClick={onSubmit} data-testid="code-review-submit">
                    Submit review
                </Button>
            </Group>
        </Stack>
    )
}

type NonEditableBodyProps = {
    isVisible: boolean
    job: LatestJobForStudy
    onBack: () => void
}

// Renders when the page is opened for a study that no longer qualifies as
// "code needs review" (e.g. peer just submitted, or stale URL). The server +
// editor auth already block writes; this view satisfies the "No further edits"
// UX expectation by not surfacing the editor / decision / submit controls.
function NonEditableBody({ isVisible, job, onBack }: NonEditableBodyProps) {
    if (!isVisible) return null
    return (
        <Stack gap="xl">
            <Box bg="white" p="xxl">
                <StudyCodeDetails job={job} />
            </Box>
            <Alert color="blue" title="Code review is closed" data-testid="code-review-closed-alert">
                A decision has already been submitted for this study code. No further edits are allowed at this point.
            </Alert>
            <Group justify="flex-start">
                <Button variant="subtle" leftSection={<CaretLeftIcon />} onClick={onBack}>
                    Back
                </Button>
            </Group>
        </Stack>
    )
}

export function CodeReviewClient({ orgSlug, study, job, latestJobStatus }: Props) {
    const isCollaborationEnabled = useCodeReviewCollaborationFeatureFlag()
    const [tabSessionId] = useState(() => crypto.randomUUID())

    const {
        feedback,
        decision,
        evaluationForm,
        canSubmit,
        handleBack,
        handleSubmit,
        confirmOpen,
        closeConfirm,
        rejectOpen,
        closeReject,
        handleConfirmSubmit,
        isPending,
    } = useCodeReview({ orgSlug, studyId: study.id, jobId: job.id, tabSessionId })

    if (!isCollaborationEnabled) return null

    const initiallyEditable = isCodeReviewEditable({ status: study.status, latestJobStatus })
    const labName = study.submittingLabName ?? study.submittedByOrgSlug

    return (
        <StudyKickOutProvider
            studyId={study.id}
            orgSlug={orgSlug}
            editableStatuses={[]}
            isEditable={isCodeReviewEditable}
            redirectTarget="studyReview"
            enabled={initiallyEditable}
        >
            <CodeReviewFeedbackProviderShare>
                <CodeReviewSubmissionListener
                    orgSlug={orgSlug}
                    studyId={study.id}
                    tabSessionId={tabSessionId}
                    enabled={initiallyEditable}
                />
                <EditableBody
                    isVisible={initiallyEditable}
                    feedback={feedback}
                    evaluationForm={evaluationForm}
                    decision={decision}
                    job={job}
                    labName={labName}
                    canSubmit={canSubmit}
                    isPending={isPending}
                    onBack={handleBack}
                    onSubmit={handleSubmit}
                    onDecisionChange={decision.onSelect}
                />
                <NonEditableBody isVisible={!initiallyEditable} job={job} onBack={handleBack} />
            </CodeReviewFeedbackProviderShare>

            <ConfirmationModal
                isOpen={confirmOpen}
                onClose={closeConfirm}
                onConfirm={handleConfirmSubmit}
                isPending={isPending}
                title="Confirm review submission?"
                confirmLabel="Yes, submit review"
                bodyParagraphs={DEFAULT_MODAL_BODY}
            />
            <ConfirmationModal
                isOpen={rejectOpen}
                onClose={closeReject}
                onConfirm={handleConfirmSubmit}
                isPending={isPending}
                title="Reject study code?"
                confirmLabel="Reject study code"
                variant="destructive"
                bodyParagraphs={REJECT_MODAL_BODY}
            />
        </StudyKickOutProvider>
    )
}
