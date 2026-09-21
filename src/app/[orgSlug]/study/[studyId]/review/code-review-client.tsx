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
import type { Decision } from '@/lib/review-decision'
import type { StepNav } from '@/lib/study-screen'
import type { SelectedStudy } from '@/server/actions/study.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { StudyJobStatus } from '@/database/types'
import { StudyAgreementPreparingNotice } from '@/components/legal/study-agreement-preparing-notice'
import { CodeEvaluationSection } from './code-evaluation-section'
import { CODE_DECISION_MODAL_CONTENT, DecisionConfirmationModal } from './decision-confirmation-modal'
import { CodeReviewFeedbackSection } from './code-review-feedback-section'
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
    const feedback = useReviewFeedback()
    const decision = useReviewDecision()
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    // Without a validator an unanswered row only disabled Submit, with no sign of which one
    // (OTTER-647).
    const evaluationForm = useForm<{ criteria: CodeReviewCriteriaDraft }>({
        initialValues: {
            criteria: {
                proposalAlignment: null,
                agreementCompliance: null,
                securityChecks: null,
                privacyProtection: null,
            },
        },
        validate: {
            criteria: Object.fromEntries(
                CODE_REVIEW_CRITERIA_KEYS.map((key) => [
                    key,
                    (value: CodeReviewCriteriaDraft[typeof key]) => (value === null ? 'Select an option.' : null),
                ]),
            ),
        },
    })

    const criteriaDraft = evaluationForm.getValues().criteria
    const criteriaComplete = allCriteriaAnswered(criteriaDraft)
    const hasDecision = decision.selected !== null

    const canSubmit = feedback.isValid && hasDecision && criteriaComplete

    const { submitReview, isPending } = useCodeReviewMutation({ studyId, jobId, orgSlug, tabSessionId })

    const handleSubmit = () => {
        if (!hasDecision) return
        openConfirm()
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
        handleSubmit,
        confirmOpen,
        closeConfirm,
        handleConfirmSubmit,
        isPending,
    }
}

type EditableBodyProps = {
    isVisible: boolean
    feedback: ReturnType<typeof useReviewFeedback>
    evaluationForm: ReturnType<typeof useCodeReview>['evaluationForm']
    decision: ReturnType<typeof useReviewDecision>
    job: LatestJobForStudy
    labName: string
    canSubmit: boolean
    isPending: boolean
    nav: StepNav
    isTestStudy: boolean
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
    nav,
    isTestStudy,
    onSubmit,
    onDecisionChange,
}: EditableBodyProps) {
    if (!isVisible) return null
    return (
        <Stack gap="xl">
            <StudyAgreementPreparingNotice
                studyId={job.studyId}
                consequence="You cannot submit a review decision yet."
            />
            <CodeEvaluationSection form={evaluationForm} enabled isTestStudy={isTestStudy} />
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
                        disabled={!canSubmit || isPending}
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

    const {
        feedback,
        decision,
        evaluationForm,
        canSubmit,
        handleSubmit,
        confirmOpen,
        closeConfirm,
        handleConfirmSubmit,
        isPending,
    } = useCodeReview({ orgSlug, studyId: study.id, jobId: job.id, tabSessionId })

    const initiallyEditable = isCodeReviewEditable({ latestJobStatus })
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
                    nav={nav}
                    isTestStudy={study.isTestStudy}
                    onSubmit={handleSubmit}
                    onDecisionChange={decision.onSelect}
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
