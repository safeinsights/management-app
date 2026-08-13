import { getCodeReviewFeedbackAction, getOutputsFeedbackAction } from '@/server/actions/study.actions'
import { isActionError } from '@/lib/errors'

const FEEDBACK_ACTIONS = {
    CODE: getCodeReviewFeedbackAction,
    RESULTS: getOutputsFeedbackAction,
} as const

// One place decides what a failed feedback fetch looks like, for both the code and outputs surfaces.
export async function loadReviewFeedback(studyId: string, kind: keyof typeof FEEDBACK_ACTIONS) {
    const entriesResult = await FEEDBACK_ACTIONS[kind]({ studyId })
    const feedbackLoadError = isActionError(entriesResult)
    const entries = feedbackLoadError ? [] : entriesResult
    return { entries, feedbackLoadError }
}
