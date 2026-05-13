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
import { Routes } from '@/lib/routes'
import type { SelectedStudy } from '@/server/actions/study.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { StudyJobStatus } from '@/database/types'
import { StudyCodeDetails } from '@/components/study/study-code-details'

import { CodeEvaluationSection } from './code-evaluation-section'
import { CodeReviewFeedbackSection } from './code-review-feedback-section'
import { CodeReviewSubmissionListener } from './code-review-submission-listener'
import type {
    CodeReviewCriteria,
    CodeReviewCriteriaDraft,
    CodeReviewCriteriaKey,
} from '@/hooks/use-code-review-evaluation-map'

type Props = {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    latestJobStatus: StudyJobStatus | null
}

const CRITERIA_KEYS: readonly CodeReviewCriteriaKey[] = [
    'proposalAlignment',
    'agreementCompliance',
    'securityChecks',
    'privacyProtection',
]

// Same shape proposed in OTTER-544 plan: PENDING-REVIEW study with a job whose
// latest status is CODE-SUBMITTED or CODE-SCANNED. Mirrors REVIEWABLE_CODE_JOB_STATUSES
// on the server (study.actions.ts) so client + server agree on editability.
const isCodeReviewEditable = ({ status, latestJobStatus }: EditableSnapshot): boolean =>
    status === 'PENDING-REVIEW' && (latestJobStatus === 'CODE-SUBMITTED' || latestJobStatus === 'CODE-SCANNED')

const REJECTION_WARNING = (
    <Text size="md" fw={600} c="red.9">
        Rejection: This is intended as a last resort due to major, unresolvable issues and will end this study. This
        action cannot be undone.
    </Text>
)

const allCriteriaAnswered = (draft: CodeReviewCriteriaDraft): draft is CodeReviewCriteria =>
    CRITERIA_KEYS.every((key) => draft[key] !== null)

function useCodeReview({ orgSlug, studyId, tabSessionId }: { orgSlug: string; studyId: string; tabSessionId: string }) {
    const feedback = useReviewFeedback()
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
    const isDecisionTerminal = decision.selected === 'approve' || decision.selected === 'reject'

    const canSubmit = feedback.isValid && isDecisionTerminal && criteriaComplete
    const backPath = Routes.orgDashboard({ orgSlug })

    const { submitReview, isPending } = useCodeReviewMutation({ studyId, orgSlug, tabSessionId })

    const handleBack = () => {
        router.push(backPath)
    }

    const handleSubmit = () => {
        if (!isDecisionTerminal) return

        if (decision.selected === 'reject') {
            openReject()
        } else {
            openConfirm()
        }
    }

    const handleConfirmSubmit = () => {
        if (!isDecisionTerminal) return
        if (!allCriteriaAnswered(criteriaDraft)) return
        submitReview({
            decision: decision.selected as 'approve' | 'reject',
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
    warning?: ReactNode
}

const ConfirmationModal: FC<ConfirmationModalProps> = ({
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
                    Please confirm you are ready to submit your decision on this study code. Other teammates may still
                    be working on it and further edits are not permitted once submitted.
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

type DecisionRadioProps = {
    value: 'approve' | 'reject' | null
    onChange: (value: 'approve' | 'reject') => void
}

const DecisionRadio: FC<DecisionRadioProps> = ({ value, onChange }) => {
    const handleSelect = (next: 'approve' | 'reject') => () => onChange(next)
    return (
        <Stack gap="sm">
            <Text fz={20} fw={700} c="charcoal.9">
                Decision
            </Text>
            <Group gap="lg">
                <Button
                    variant={value === 'approve' ? 'filled' : 'outline'}
                    onClick={handleSelect('approve')}
                    data-testid="code-review-decision-approve"
                >
                    Approve
                </Button>
                <Button
                    variant={value === 'reject' ? 'filled' : 'outline'}
                    color={value === 'reject' ? 'red' : undefined}
                    onClick={handleSelect('reject')}
                    data-testid="code-review-decision-reject"
                >
                    Reject
                </Button>
            </Group>
        </Stack>
    )
}

type EditableBodyProps = {
    isVisible: boolean
    feedback: ReturnType<typeof useReviewFeedback>
    evaluationForm: ReturnType<typeof useCodeReview>['evaluationForm']
    decision: ReturnType<typeof useReviewDecision>
    job: LatestJobForStudy
    canSubmit: boolean
    isPending: boolean
    onBack: () => void
    onSubmit: () => void
    onDecisionChange: (next: 'approve' | 'reject') => void
}

function EditableBody({
    isVisible,
    feedback,
    evaluationForm,
    decision,
    job,
    canSubmit,
    isPending,
    onBack,
    onSubmit,
    onDecisionChange,
}: EditableBodyProps) {
    if (!isVisible) return null
    const decisionValue = decision.selected === 'approve' || decision.selected === 'reject' ? decision.selected : null
    return (
        <Stack gap="xl">
            <Box bg="white" p="xxl">
                <StudyCodeDetails job={job} />
            </Box>
            <CodeEvaluationSection form={evaluationForm} enabled />
            <CodeReviewFeedbackSection feedback={feedback} studyId={job.studyId} />
            <Box bg="white" p="xxl">
                <DecisionRadio value={decisionValue} onChange={onDecisionChange} />
            </Box>
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
    } = useCodeReview({ orgSlug, studyId: study.id, tabSessionId })

    if (!isCollaborationEnabled) return null

    const initiallyEditable = isCodeReviewEditable({ status: study.status, latestJobStatus })

    const handleDecisionChange = (next: 'approve' | 'reject') => {
        decision.onSelect(next)
    }

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
                    canSubmit={canSubmit}
                    isPending={isPending}
                    onBack={handleBack}
                    onSubmit={handleSubmit}
                    onDecisionChange={handleDecisionChange}
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
            />
            <ConfirmationModal
                isOpen={rejectOpen}
                onClose={closeReject}
                onConfirm={handleConfirmSubmit}
                isPending={isPending}
                title="Reject study code?"
                confirmLabel="Reject study code"
                variant="destructive"
                warning={REJECTION_WARNING}
            />
        </StudyKickOutProvider>
    )
}
