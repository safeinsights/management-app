import { notFound } from 'next/navigation'
import { codeSubmissionVersion, getOrgNameFromId, latestSubmittedJobForStudy } from '@/server/db/queries'
import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { actionResult } from '@/lib/utils'
import { projectStudyState, resolveStepNav } from '@/lib/study-screen'
import { CodePostSubmissionView } from '../view/code-post-submission-view'
import type { ScreenComponentProps } from './types'

export async function CodeUnderReviewScreen({ study, raw, orgSlug, dashboardHref, returnTo }: ScreenComponentProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()

    const reviewingOrgName = await getOrgNameFromId(study.orgId)
    const submissionVersion = await codeSubmissionVersion(study.id)
    // Feedback is only meaningful on resubmissions, so skip the query on v1.
    const feedbackEntries =
        submissionVersion > 1 ? actionResult(await getCodeReviewFeedbackAction({ studyId: study.id })) : []

    const nav = resolveStepNav('code-under-review', projectStudyState(raw), {
        orgSlug,
        studyId: study.id,
        dashboardHref,
        returnTo,
    })

    return (
        <CodePostSubmissionView
            orgSlug={orgSlug}
            study={study}
            job={job}
            reviewingOrgName={reviewingOrgName}
            nav={nav}
            submissionVersion={submissionVersion}
            feedbackEntries={feedbackEntries}
        />
    )
}
