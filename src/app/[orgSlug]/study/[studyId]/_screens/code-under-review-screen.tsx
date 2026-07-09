import { notFound } from 'next/navigation'
import { codeSubmissionVersion, getOrgNameFromId, latestSubmittedJobForStudy } from '@/server/db/queries'
import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { actionResult } from '@/lib/utils'
import { CodePostSubmissionView } from '../view/code-post-submission-view'
import type { ScreenComponentProps } from './types'
import type { Route } from 'next'

// code-under-review: code submitted, no decision yet. The submitted job must exist at this point;
// guard with notFound() so the render below never receives null.
export async function CodeUnderReviewScreen({ study, orgSlug, dashboardHref, returnTo }: ScreenComponentProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()

    const reviewingOrgName = await getOrgNameFromId(study.orgId)
    const submissionVersion = await codeSubmissionVersion(study.id)
    // Feedback is only meaningful on resubmissions; skip the extra query on v1.
    const feedbackEntries =
        submissionVersion > 1 ? actionResult(await getCodeReviewFeedbackAction({ studyId: study.id })) : []

    return (
        <CodePostSubmissionView
            orgSlug={orgSlug}
            study={study}
            job={job}
            reviewingOrgName={reviewingOrgName}
            dashboardHref={dashboardHref as Route}
            returnTo={returnTo}
            submissionVersion={submissionVersion}
            feedbackEntries={feedbackEntries}
        />
    )
}
