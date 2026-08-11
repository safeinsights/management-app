import { getOutputsFeedbackAction } from '@/server/actions/study.actions'
import { isActionError } from '@/lib/errors'

export async function loadOutputsFeedback(studyId: string) {
    const entriesResult = await getOutputsFeedbackAction({ studyId })
    const feedbackLoadError = isActionError(entriesResult)
    const entries = feedbackLoadError ? [] : entriesResult
    return { entries, feedbackLoadError }
}
