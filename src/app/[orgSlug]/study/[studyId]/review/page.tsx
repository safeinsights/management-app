'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import type { ReviewDecision } from '@/database/types'
import { isActionError } from '@/lib/errors'
import { isSubmittedProposalReviewStatus } from '@/lib/proposal-review'
import { Routes } from '@/lib/routes'
import { studyHasJobStatus } from '@/lib/studies'
import { isCodeDecisionStatus, isStudyResultsStatus } from '@/lib/study-job-status'
import { isSubmittedStudy } from '@/schema/study'
import {
    getCodeReviewFeedbackAction,
    getProposalFeedbackForStudyAction,
    getStudyAction,
} from '@/server/actions/study.actions'
import { currentReviewVersion, latestSubmittedJobForStudy } from '@/server/db/queries'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'
import { CodeReview } from './code-review'
import { ProposalReviewFromAgreementsView } from './proposal-review-from-agreements-view'
import { PostFeedbackView } from './post-feedback-view'
import { ProposalReviewView } from './proposal-review-view'
import { StudyDetailsReviewer } from './study-details-reviewer'

const CODE_DECISION_TO_REVIEW_DECISION: Record<string, ReviewDecision> = {
    'CODE-APPROVED': 'APPROVE',
    'CODE-CHANGES-REQUESTED': 'NEEDS-CLARIFICATION',
    'CODE-REJECTED': 'REJECT',
}

export default async function StudyReviewPage(props: {
    params: Promise<{
        orgSlug: string
        studyId: string
    }>
    searchParams: Promise<{ from?: string }>
}) {
    const params = await props.params
    const searchParams = await props.searchParams
    const { orgSlug, studyId } = params

    const session = await sessionFromClerk()
    const currentOrg = session?.orgs[orgSlug]
    if (!session || !currentOrg) {
        return <AccessDeniedAlert />
    }

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    if (currentOrg.type === 'lab') {
        redirect(Routes.studyView({ orgSlug: study.submittedByOrgSlug, studyId }))
    }

    // Reviewer dashboards filter out DRAFT studies, but a direct URL could still
    // hit this route. Narrow here so downstream views see a guaranteed non-null title.
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    if (currentOrg.type === 'enclave') {
        // OTTER-552: once a code-review decision has been made, opening the study (e.g. via
        // the dashboard "View" link, which carries no `from` param) must land the DO on the
        // post-feedback code page — not the active code-review/decision page. We gate on the
        // *latest* job status so a subsequent resubmission (a fresh CODE-SUBMITTED after a
        // change request) reopens active review instead of sticking on the decision page.
        const latestDecisionJob = await latestSubmittedJobForStudy(studyId)
        const codeSubmitted =
            studyHasJobStatus(study, 'CODE-SUBMITTED') ||
            (latestDecisionJob?.statusChanges.some((s) => s.status === 'CODE-SUBMITTED') ?? false)
        const decisionMade = isCodeDecisionStatus(latestDecisionJob?.statusChanges[0]?.status)

        // When a reviewer navigates back from the code review page, OR the code decision has
        // already been made, show the post-feedback view. After a code-review decision exists,
        // render the code-review variant against studyReviewComment rows. Before a decision is
        // submitted (e.g. clicking the breadcrumb during active review) fall back to the
        // proposal post-feedback view so the user lands on a meaningful page instead of a
        // blank PostFeedbackView render.
        if ((searchParams.from === 'code-review' || decisionMade) && codeSubmitted) {
            const codeEntries = await getCodeReviewFeedbackAction({ studyId })
            if (isActionError(codeEntries)) {
                return <AlertNotFound title="Feedback could not be loaded" message="please refresh and try again" />
            }
            const job = latestDecisionJob
            if (codeEntries.length > 0) {
                return <PostFeedbackView orgSlug={orgSlug} study={study} entries={codeEntries} kind="CODE" job={job} />
            }

            // OTTER-538 QA: a study can reach a code-decision stage via proposal approve/reject,
            // which writes a CODE-* job status without writing a code-review comment.
            // With no code-review rows we must still land the DO on the post-code-feedback page
            // (code decision), not the proposal "Review initial request" fallback below.
            const fallbackStatus = job?.statusChanges.find((s) => isCodeDecisionStatus(s.status))
            if (fallbackStatus) {
                return (
                    <PostFeedbackView
                        orgSlug={orgSlug}
                        study={study}
                        entries={[]}
                        kind="CODE"
                        job={job}
                        fallbackDecision={CODE_DECISION_TO_REVIEW_DECISION[fallbackStatus.status]}
                        fallbackTimestamp={fallbackStatus.createdAt}
                    />
                )
            }

            const proposalEntries = await getProposalFeedbackForStudyAction({ studyId })
            if (isActionError(proposalEntries)) {
                return <AlertNotFound title="Feedback could not be loaded" message="please refresh and try again" />
            }
            // Only render the proposal post-feedback view when there is feedback to show. An empty
            // list would blank the page (PostFeedbackView returns null with no decision). A study
            // approved with no feedback (approveStudyProposalAction writes no comment) whose code is
            // still awaiting a decision falls through to the active-review routing below instead.
            if (proposalEntries.length > 0) {
                return <PostFeedbackView orgSlug={orgSlug} study={study} entries={proposalEntries} />
            }
        }

        // When a reviewer navigates back from the agreements step, show the proposal
        if (searchParams.from === 'agreements' && codeSubmitted) {
            return (
                <ProposalReviewFromAgreementsView
                    orgSlug={orgSlug}
                    study={study}
                    agreementsHref={Routes.studyAgreements({ orgSlug, studyId })}
                />
            )
        }

        if (codeSubmitted) {
            // Gate through agreements if the reviewer hasn't acknowledged them yet
            if (!study.reviewerAgreementsAckedAt && searchParams.from !== 'agreements-proceed') {
                return redirect(Routes.studyAgreements({ orgSlug, studyId }))
            }

            // OTTER-538: once the job has reached the results stage, render the
            // redesigned results-only Study Details page.
            const latestJobStatus = latestDecisionJob?.statusChanges[0]?.status

            if (isStudyResultsStatus(latestJobStatus)) {
                return <StudyDetailsReviewer orgSlug={orgSlug} study={study} />
            }

            // Prior code-review entries trigger the resubmission variant inside
            // CodeReview. Swallow errors so a feedback fetch failure degrades to
            // the first-submission view rather than blocking review.
            const codeReviewEntries = await getCodeReviewFeedbackAction({ studyId })
            const safeCodeReviewEntries = isActionError(codeReviewEntries) ? [] : codeReviewEntries

            return <CodeReview orgSlug={orgSlug} study={study} entries={safeCodeReviewEntries} />
        }

        if (isSubmittedProposalReviewStatus(study.status)) {
            const entries = await getProposalFeedbackForStudyAction({ studyId })
            if (isActionError(entries)) {
                return <AlertNotFound title="Feedback could not be loaded" message="please refresh and try again" />
            }
            return <PostFeedbackView orgSlug={orgSlug} study={study} entries={entries} />
        }

        // Editable PENDING-REVIEW branch: load prior feedback entries and the
        // current review round. Round N+1's editor binds to a fresh versioned
        // Yjs doc (`review-feedback-${studyId}-v${reviewVersion}`), and the
        // prior rounds render as read-only history above it.
        //
        // `reviewVersion` MUST come from `currentReviewVersion(studyId)` (not
        // from the entries action), so an unrelated failure of the entries
        // action only loses the history rendering. Deriving `reviewVersion`
        // from `safeEntries` after a failure would silently downgrade the
        // editor to v1: round 2 reviewers would then bind to the wrong Yjs
        // room (round 1's `…-v1`), and any submit attempt would be rejected
        // by `submitProposalReviewAction`'s `reviewVersion` mismatch check
        // with a confusing "stale review round 1 (current 2)" error.
        const reviewVersion = await currentReviewVersion(studyId)
        const entries = await getProposalFeedbackForStudyAction({ studyId })
        const safeEntries = isActionError(entries) ? [] : entries
        return (
            <ProposalReviewView
                orgSlug={orgSlug}
                study={study}
                priorEntries={safeEntries}
                reviewVersion={reviewVersion}
            />
        )
    }

    return <AlertNotFound title="Study was not found" message="no such study exists" />
}
