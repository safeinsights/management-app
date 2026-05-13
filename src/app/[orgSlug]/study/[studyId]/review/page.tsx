'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import {
    CodeReviewFeatureFlag,
    PostSubmissionFeatureFlag,
    ProposalReviewFeatureFlag,
} from '@/components/openstax-feature-flag'
import { isActionError } from '@/lib/errors'
import { isSubmittedProposalReviewStatus } from '@/lib/proposal-review'
import { Routes } from '@/lib/routes'
import { studyHasJobStatus } from '@/lib/studies'
import { getProposalFeedbackForStudyAction, getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { redirect } from 'next/navigation'
import { CodeReviewRedesignView } from './code-review-redesign-view'
import { CodeReviewView } from './code-review-view'
import { LegacyProposalReviewView } from './legacy-proposal-review-view'
import { PostFeedbackView } from './post-feedback-view'
import { ProposalReviewView } from './proposal-review-view'

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

        // When a reviewer navigates back from the code review page, show the post-feedback view
        if (searchParams.from === 'code-review' && codeSubmitted) {
            const entries = await getProposalFeedbackForStudyAction({ studyId })
            if (isActionError(entries)) {
                return <AlertNotFound title="Feedback could not be loaded" message="please refresh and try again" />
            }
            return <PostFeedbackView orgSlug={orgSlug} study={study} entries={entries} />
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
        // prior rounds render as read-only history above it. We deliberately
        // fail soft (`safeEntries = []`) so an unrelated query failure doesn't
        // block the editable surface — the submitted branch above still hard-
        // errors because that view is defined by the history.
        const entries = await getProposalFeedbackForStudyAction({ studyId })
        const safeEntries = isActionError(entries) ? [] : entries
        const reviewVersion = safeEntries[0]?.version ?? 1
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
