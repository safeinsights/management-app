import { getCodeReviewFeedbackAction } from '@/server/actions/review-feedback.actions'
import { loadFeedbackEntries } from './load-feedback-entries'

export const loadCodeReviewFeedback = (studyId: string) => loadFeedbackEntries(getCodeReviewFeedbackAction, studyId)
