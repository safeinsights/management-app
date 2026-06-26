import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { currentReviewVersion } from '@/server/db/queries'
import { getProposalFeedbackForStudyAction } from '@/server/actions/study.actions'
import { ProposalReviewView } from '../review/proposal-review-view'
import type { ScreenComponentProps } from './types'

// PENDING-REVIEW: editable proposal-review page. reviewVersion MUST come from currentReviewVersion
// (not the entries action) so an entries failure can't silently downgrade the editor's Yjs room.
export async function ReviewerProposalReviewScreen({ study, orgSlug }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const reviewVersion = await currentReviewVersion(study.id)
    const entries = await getProposalFeedbackForStudyAction({ studyId: study.id })
    const priorEntries = isActionError(entries) ? [] : entries
    return (
        <ProposalReviewView orgSlug={orgSlug} study={study} priorEntries={priorEntries} reviewVersion={reviewVersion} />
    )
}
