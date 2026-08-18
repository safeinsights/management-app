import type { StudyJobStatus } from '@/database/types'
import { AlertNotFound } from '@/components/errors'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import type { RawJob } from '@/lib/study-screen'
import type { OutputsFeedbackThreadEntry } from '@/server/actions/study.actions'

// Raw status rows carry createdAt optionally (fixtures omit it); only dated rows can date the banner.
export const datedStatusChanges = (job: RawJob) =>
    job.statusChanges.filter((c): c is { status: StudyJobStatus; createdAt: Date | string } => !!c.createdAt)

// Mirrors the code surface: a failed fetch swaps in the shared notice instead of hiding the section.
export const FeedbackSection = ({
    feedbackLoadError,
    entries,
}: {
    feedbackLoadError: boolean
    entries: OutputsFeedbackThreadEntry[]
}) => {
    if (feedbackLoadError) {
        return <AlertNotFound title="Feedback could not be loaded" message="Please refresh and try again" />
    }
    return <FeedbackAndNotesSection entries={entries} alwaysExpandLatest />
}
