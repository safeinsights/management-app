import { captureException } from '@sentry/nextjs'
import { getStudyAction, getProposalFeedbackForStudyAction } from '@/server/actions/study.actions'
import { getOrgNameFromId } from '@/server/db/queries'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { SubmittedView } from './submitted-view'

export default async function StudySubmittedRoute(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    const result = await getStudyAction({ studyId })

    if (isActionError(result) || !result) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const [orgName, feedbackResult] = await Promise.all([
        getOrgNameFromId(result.orgId),
        getProposalFeedbackForStudyAction({ studyId }),
    ])

    const feedbackError = isActionError(feedbackResult)

    if (feedbackError) {
        captureException(new Error(`Failed to fetch proposal feedback for study ${studyId}: ${feedbackResult.error}`))
    }

    const entries = feedbackError ? [] : feedbackResult

    return <SubmittedView orgSlug={orgSlug} study={result} orgName={orgName} entries={entries} feedbackError={feedbackError} />
}
