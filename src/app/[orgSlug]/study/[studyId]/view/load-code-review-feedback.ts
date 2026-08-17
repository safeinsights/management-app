import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { loadFeedbackEntries } from './load-feedback-entries'

export const loadCodeReviewFeedback = (studyId: string) => loadFeedbackEntries(getCodeReviewFeedbackAction, studyId)
