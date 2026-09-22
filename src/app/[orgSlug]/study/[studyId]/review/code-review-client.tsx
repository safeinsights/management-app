'use client'

import { useState } from 'react'
import { Alert, Button, Stack } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useForm } from '@/common'

import { StepNavigation } from '@/components/study/step-navigation'
import { useCodeReviewMutation } from '@/hooks/use-code-review-mutation'
import { useReviewDecision } from '@/hooks/use-review-decision'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { StudyKickOutProvider, type EditableSnapshot } from '@/hooks/use-study-status-on-reconnect'
import { CodeReviewFeedbackProviderShare } from '@/lib/realtime/code-review-feedback-provider-context'
import { REVIEWABLE_CODE_JOB_STATUSES } from '@/lib/code-review-status'
import { focusFirstInvalid } from '@/lib/focus-first-invalid'
import { CODE_EVALUATION_CRITERIA_ERROR } from '@/lib/proposal-review'
import type { Decision } from '@/lib/review-decision'
import { Routes } from '@/lib/routes'
import type { StepNav } from '@/lib/study-screen'
import type { SelectedStudy } from '@/server/actions/study.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { StudyJobStatus } from '@/database/types'
import { StudyAgreementPreparingNotice } from '@/components/legal/study-agreement-preparing-notice'
import { CodeEvaluationSection, criterionFieldId } from './code-evaluation-section'
import { CODE_DECISION_MODAL_CONTENT, DecisionConfirmationModal } from './decision-confirmation-modal'
import { CodeReviewFeedbackSection, DECISION_GROUP_ID, FEEDBACK_INPUT_ID } from './code-review-feedback-section'
import { CodeReviewSubmissionListener } from './code-review-submission-listener'
import { CODE_REVIEW_CRITERIA_KEYS } from '@/hooks/use-code-review-evaluation-map'
import type { CodeReviewCriteria, CodeReviewCriteriaDraft } from '@/hooks/use-code-review-evaluation-map'

type Props = {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    latestJobStatus: StudyJobStatus | null
    nav: StepNav
}

// Driven by the job status alone: gating on study.status showed "Code review is closed" for
// legitimate resubmissions, which leave the study at APPROVED.
const isCodeReviewEditable = ({ latestJobStatus }: Pick<EditableSnapshot, 'latestJobStatus'>): boolean =>
    latestJobStatus !== null && REVIEWABLE_CODE_JOB_STATUSES.includes(latestJobStatus)

const allCriteriaAnswered = (draft: CodeReviewCriteriaDraft): draft is CodeReviewCriteria =>
    CODE_REVIEW_CRITERIA_KEYS.every((key) => draft[key] !== null)

const FIELD_ORDER = [...CODE_REVIEW_CRITERIA_KEYS.map(criterionFieldId), FEEDBACK_INPUT_ID, DECISION_GROUP_ID]

const flaggedFields = (
    criteriaErrors: Record<string, unknown>,
    hasFeedbackError: boolean,
    hasDecisionError: boolean,
): Record<string, boolean> => ({
    ...Object.fromEntries(
        CODE_REVIEW_CRITERIA_KEYS.map((key) => [criterionFieldId(key), !!criteriaErrors[`criteria.${key}`]]),
    ),
    [FEEDBACK_INPUT_ID]: hasFeedbackError,
    [DECISION_GROUP_ID]: hasDecisionError,
})

function useCodeReview({
    orgSlug,
    studyId,
    jobId,
    tabSessionId,
    labName,
}: {
    orgSlug: string
    studyId: string
    jobId: string
    tabSessionId: string
    labName: string
}) {
    const feedback = useReviewFeedback(`Enter your feedback for ${labName}.`)
    const decision = useReviewDecision()
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)
    // State (not a ref): must re-render so validateOnBlur and the gated field blurs see the flip.
    const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)

    const evaluationForm = useForm<{ criteria: CodeReviewCriteriaDraft }>({
        initialValues: {
            criteria: {
                proposalAlignment: null,
                agreementCompliance: null,
                privacyProtection: null,
            },
        },
        validate: {
            criteria: Object.fromEntries(
                CODE_REVIEW_CRITERIA_KEYS.map((key) => [
                    key,
                    (value: CodeReviewCriteriaDraft[typeof key]) =>
                        value === null ? CODE_EVALUATION_CRITERIA_ERROR : null,
                ]),
            ),
        },
    })

    const { submitReview, isPending } = useCodeReviewMutation({ studyId, jobId, orgSlug, tabSessionId })

    const handleSubmit = async () => {
        setHasAttemptedSubmit(true)

        // feedback/decision onBlur raise their errors; validity itself comes from values
        // (`isValid` also covers the character cap).
        const criteriaValidation = evaluationForm.validate()
        await feedback.onBlur()
        await decision.onBlur()

        const hasFeedbackError = !feedback.isValid
        const hasDecisionError = decision.selected === null

        if (criteriaValidation.hasErrors || hasFeedbackError || hasDecisionError) {
            const flagged = flaggedFields(criteriaValidation.errors, hasFeedbackError, hasDecisionError)
            focusFirstInvalid(FIELD_ORDER, (fieldId) => flagged[fieldId])
            return
        }

        openConfirm()
    }

    const handleConfirmSubmit = () => {
        if (decision.selected === null) return
        const criteriaDraft = evaluationForm.getValues().criteria
        if (!allCriteriaAnswered(criteriaDraft)) return
        submitReview({
            decision: decision.selected,
            feedback: feedback.value,
            criteria: criteriaDraft,
        })
    }

    const conditionalFeedbackBlur = async () => {
        if (hasAttemptedSubmit) return feedback.onBlur()
    }

    const conditionalDecisionBlur = async () => {
        if (hasAttemptedSubmit) return decision.onBlur()
    }

    return {
        feedback: { ...feedback, onBlur: conditionalFeedbackBlur },
        decision: { ...decision, onBlur: conditionalDecisionBlur },
        evaluationForm,
        handleSubmit,
        confirmOpen,
        closeConfirm,
        handleConfirmSubmit,
        isPending,
        hasAttemptedSubmit,
    }
}

type EditableBodyProps = {
    isVisible: boolean
    feedback: ReturnType<typeof useReviewFeedback>
    evaluationForm: ReturnType<typeof useCodeReview>['evaluationForm']
    decision: ReturnType<typeof useReviewDecision>
    job: LatestJobForStudy
    labName: string
    proposalHref: string
    isPending: boolean
    nav: StepNav
    isTestStudy: boolean
    onSubmit: () => void
    onDecisionChange: (next: Decision) => void
    hasAttemptedSubmit: boolean
}

function EditableBody({
    isVisible,
    feedback,
    evaluationForm,
    decision,
    job,
    labName,
    proposalHref,
    isPending,
    nav,
    isTestStudy,
    onSubmit,
    onDecisionChange,
    hasAttemptedSubmit,
}: EditableBodyProps) {
    if (!isVisible) return null
    return (
        <Stack gap="xl">
            <StudyAgreementPreparingNotice
                studyId={job.studyId}
                consequence="You cannot submit a review decision yet."
            />
            <CodeEvaluationSection
                form={evaluationForm}
                enabled
                proposalHref={proposalHref}
                isTestStudy={isTestStudy}
                validateOnBlur={hasAttemptedSubmit}
            />
            <CodeReviewFeedbackSection
                feedback={feedback}
                studyId={job.studyId}
                jobId={job.id}
                decisionValue={decision.selected}
                onDecisionChange={onDecisionChange}
                onDecisionBlur={decision.onBlur}
                decisionError={decision.error}
                labName={labName}
            />
            <StepNavigation
                nav={nav}
                formAction={
                    <Button
                        size="md"
                        variant="filled"
                        disabled={isPending}
                        onClick={onSubmit}
                        data-testid="code-review-submit"
                    >
                        Submit decision
                    </Button>
                }
            />
        </Stack>
    )
}

type NonEditableBodyProps = {
    isVisible: boolean
    nav: StepNav
}

// For a study that no longer qualifies as "code needs review". Writes are already blocked
// server-side; this just hides the editor and submit controls.
function NonEditableBody({ isVisible, nav }: NonEditableBodyProps) {
    if (!isVisible) return null
    return (
        <Stack gap="xl">
            <Alert color="blue" title="Code review is closed" data-testid="code-review-closed-alert">
                A decision has already been submitted for this study code. No further edits are allowed at this point.
            </Alert>
            <StepNavigation nav={nav} />
        </Stack>
    )
}

export function CodeReviewClient({ orgSlug, study, job, latestJobStatus, nav }: Props) {
    const [tabSessionId] = useState(() => crypto.randomUUID())

    const initiallyEditable = isCodeReviewEditable({ latestJobStatus })
    const labName = study.submittingLabName ?? study.submittedByOrgSlug
    const proposalHref = Routes.studyReviewProposal({ orgSlug, studyId: study.id })

    const {
        feedback,
        decision,
        evaluationForm,
        handleSubmit,
        confirmOpen,
        closeConfirm,
        handleConfirmSubmit,
        isPending,
        hasAttemptedSubmit,
    } = useCodeReview({ orgSlug, studyId: study.id, jobId: job.id, tabSessionId, labName })

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
                    proposalHref={proposalHref}
                    isPending={isPending}
                    nav={nav}
                    isTestStudy={study.isTestStudy}
                    onSubmit={handleSubmit}
                    onDecisionChange={decision.onSelect}
                    hasAttemptedSubmit={hasAttemptedSubmit}
                />
                <NonEditableBody isVisible={!initiallyEditable} nav={nav} />
            </CodeReviewFeedbackProviderShare>

            <DecisionConfirmationModal
                decision={decision.selected}
                labName={labName}
                content={CODE_DECISION_MODAL_CONTENT}
                isOpen={confirmOpen}
                onClose={closeConfirm}
                onConfirm={handleConfirmSubmit}
                isPending={isPending}
            />
        </StudyKickOutProvider>
    )
}
