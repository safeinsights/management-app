import { notFound } from 'next/navigation'
import { codeSubmissionVersion, latestSubmittedJobForStudy } from '@/server/db/queries'
import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { listWorkspaceFileActivityAction } from '@/server/actions/workspaces.actions'
import { actionResult } from '@/lib/utils'
import { CodePostSubmissionView } from '../view/code-post-submission-view'
import type { ScreenComponentProps } from './types'
import { currentDb } from '@/server/request-context'

export async function CodeUnderReviewScreen({ study, nav }: ScreenComponentProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()

    const activityByName = actionResult(await listWorkspaceFileActivityAction({ studyId: study.id, jobId: job.id }))
    const submissionVersion = await codeSubmissionVersion(study.id, currentDb())
    // Feedback is only meaningful on resubmissions, so skip the query on v1.
    const feedbackEntries =
        submissionVersion > 1 ? actionResult(await getCodeReviewFeedbackAction({ studyId: study.id })) : []

    return (
        <CodePostSubmissionView
            study={study}
            job={job}
            activityByName={activityByName}
            reviewingOrgName={study.orgName}
            nav={nav}
            submissionVersion={submissionVersion}
            feedbackEntries={feedbackEntries}
        />
    )
}
