import { AlertNotFound } from '@/components/errors'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { Routes } from '@/lib/routes'
import { StudyResultsRedesignWithReview } from './study-results-redesign-with-review'
import { StudyDetailsReviewerView } from './study-details-reviewer-view'
import type { SelectedStudy } from '@/server/actions/study.actions'

// OTTER-538: Study Details page (DO) — results-only layout.
// Removes the "Study Code" section. The "Previous" button takes the DO back to
// the post-code-feedback page from OTTER-552.

type StudyDetailsReviewerProps = {
    orgSlug: string
    study: SelectedStudy
}

export async function StudyDetailsReviewer({ orgSlug, study }: StudyDetailsReviewerProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const previousHref = Routes.studyReview({ orgSlug, studyId: study.id })

    return (
        <StudyDetailsReviewerView orgSlug={orgSlug} previousHref={previousHref}>
            <StudyResultsRedesignWithReview job={job} study={study} />
        </StudyDetailsReviewerView>
    )
}
