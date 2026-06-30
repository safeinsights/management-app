import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { isActionError } from '@/lib/errors'

export async function loadCodeReviewFeedback(studyId: string) {
    const entriesResult = await getCodeReviewFeedbackAction({ studyId })
    const feedbackLoadError = isActionError(entriesResult)
    const entries = feedbackLoadError ? [] : entriesResult
    return { entries, feedbackLoadError }
}
