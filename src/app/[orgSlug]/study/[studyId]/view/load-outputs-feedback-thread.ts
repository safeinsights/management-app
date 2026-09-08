import { getOutputsFeedbackThreadAction } from '@/server/actions/study.actions'
import { loadFeedbackEntries } from './load-feedback-entries'

export const loadOutputsFeedbackThread = (studyId: string) =>
    loadFeedbackEntries(getOutputsFeedbackThreadAction, studyId)
