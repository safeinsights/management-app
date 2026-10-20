import { getOutputsDecisionFeedbackAction } from '@/server/actions/review-feedback.actions'
import { loadFeedbackEntries } from './load-feedback-entries'

export const loadOutputsFeedback = (studyId: string) => loadFeedbackEntries(getOutputsDecisionFeedbackAction, studyId)
