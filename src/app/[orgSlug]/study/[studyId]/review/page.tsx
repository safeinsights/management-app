'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import {
    CodeReviewFeatureFlag,
    PostSubmissionFeatureFlag,
    ProposalReviewFeatureFlag,
    StudyDetailsRedesignFeatureFlag,
} from '@/components/openstax-feature-flag'
import { isActionError } from '@/lib/errors'
import { isSubmittedProposalReviewStatus } from '@/lib/proposal-review'
import { Routes } from '@/lib/routes'
import { studyHasJobStatus } from '@/lib/studies'
import { isStudyResultsStatus } from '@/lib/study-job-status'
import {
    getCodeReviewFeedbackAction,
    getProposalFeedbackForStudyAction,
    getStudyAction,
} from '@/server/actions/study.actions'
import { currentReviewVersion, latestSubmittedJobForStudy } from '@/server/db/queries'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'
import { CodeReviewRedesignView } from './code-review-redesign-view'
import { CodeReviewView } from './code-review-view'
import { LegacyProposalReviewView } from './legacy-proposal-review-view'
import { PostFeedbackView } from './post-feedback-view'
import { ProposalReviewView } from './proposal-review-view'
import { StudyDetailsRedesignView } from './study-details-redesign-view'

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

    if (currentOrg.type === 'enclave') {
        const codeSubmitted = studyHasJobStatus(study, 'CODE-SUBMITTED')

        // When a reviewer navigates back from the code review page, show the post-feedback
        // view. After a code-review decision exists, render the code-review variant against
        // studyReviewComment rows. Before a decision is submitted (e.g. clicking the
        // breadcrumb during active review) fall back to the proposal post-feedback view so
        // the user lands on a meaningful page instead of a blank PostFeedbackView render.
        if (searchParams.from === 'code-review' && codeSubmitted) {
            const codeEntries = await getCodeReviewFeedbackAction({ studyId })
            if (isActionError(codeEntries)) {
                return <AlertNotFound title="Feedback could not be loaded" message="please refresh and try again" />
            }
            if (codeEntries.length > 0) {
                return <PostFeedbackView orgSlug={orgSlug} study={study} entries={codeEntries} kind="CODE" />
            }
            const proposalEntries = await getProposalFeedbackForStudyAction({ studyId })
            if (isActionError(proposalEntries)) {
                return <AlertNotFound title="Feedback could not be loaded" message="please refresh and try again" />
            }
            return <PostFeedbackView orgSlug={orgSlug} study={study} entries={proposalEntries} />
        }

        // When a reviewer navigates back from the agreements step, show the proposal
        if (searchParams.from === 'agreements' && codeSubmitted) {
            return (
                <LegacyProposalReviewView
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

            // OTTER-538: once the job has reached the results stage, swap the legacy
            // CodeReviewView for the redesigned results-only Study Details page when
            // the feature flag is on.
            const latestJob = await latestSubmittedJobForStudy(studyId)
            const latestJobStatus = latestJob?.statusChanges[0]?.status

            if (isStudyResultsStatus(latestJobStatus)) {
                return (
                    <StudyDetailsRedesignFeatureFlag
                        defaultContent={<CodeReviewView orgSlug={orgSlug} study={study} />}
                        optInContent={<StudyDetailsRedesignView orgSlug={orgSlug} study={study} />}
                    />
                )
            }

            return (
                <CodeReviewFeatureFlag
                    defaultContent={<CodeReviewView orgSlug={orgSlug} study={study} />}
                    optInContent={<CodeReviewRedesignView orgSlug={orgSlug} study={study} />}
                />
            )
        }

        if (isSubmittedProposalReviewStatus(study.status)) {
            const entries = await getProposalFeedbackForStudyAction({ studyId })
            if (isActionError(entries)) {
                return <AlertNotFound title="Feedback could not be loaded" message="please refresh and try again" />
            }
            return (
                <PostSubmissionFeatureFlag
                    defaultContent={<LegacyProposalReviewView orgSlug={orgSlug} study={study} />}
                    optInContent={<PostFeedbackView orgSlug={orgSlug} study={study} entries={entries} />}
                />
            )
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
            <ProposalReviewFeatureFlag
                defaultContent={<LegacyProposalReviewView orgSlug={orgSlug} study={study} />}
                optInContent={
                    <ProposalReviewView
                        orgSlug={orgSlug}
                        study={study}
                        priorEntries={safeEntries}
                        reviewVersion={reviewVersion}
                    />
                }
            />
        )
    }

    return <AlertNotFound title="Study was not found" message="no such study exists" />
}
