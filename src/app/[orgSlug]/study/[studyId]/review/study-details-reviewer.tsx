import { AlertNotFound } from '@/components/errors'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { Routes } from '@/lib/routes'
import { StudyResultsRedesignWithReview } from './study-results-redesign-with-review'
import { StudyDetailsReviewerView } from './study-details-reviewer-view'
import type { SelectedStudy } from '@/server/actions/study.actions'

// OTTER-538: Study Details page (DO) — results-only layout, removes the "Study Code" section.
// OTTER-643: Previous walks back to the read-only code step (/review/code). A bare /review href would
// re-resolve straight back to this screen (results out-rank every other reviewer screen), so the
// dedicated route is what breaks the self-link — see resolveReviewerCodeScreen.

type StudyDetailsReviewerProps = {
    orgSlug: string
    study: SelectedStudy
}

export async function StudyDetailsReviewer({ orgSlug, study }: StudyDetailsReviewerProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const previousHref = Routes.studyReviewCode({ orgSlug, studyId: study.id })

    return (
        <StudyDetailsReviewerView orgSlug={orgSlug} previousHref={previousHref}>
            <StudyResultsRedesignWithReview job={job} study={study} />
        </StudyDetailsReviewerView>
    )
}
