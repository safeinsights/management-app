import { Stack } from '@mantine/core'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { AgreementsPage } from '../agreements/agreements-page'
import type { ScreenComponentProps } from './types'

// OTTER-727: HIDDEN — nothing renders this. The `reviewer-agreements` rule was removed from
// REVIEWER_SCREEN_RULES, so reviewer-code-review now claims the whole codeAwaitingDecision state.
// Retained rather than deleted because the product direction for agreements is undecided; restoring
// the gate means re-adding that one rule entry (and the back-edges listed in the OTTER-727 plan).
//
// Reviewer agreements gate, modelled as a screen (not a redirect). Acking proceeds into code review
// (the bare /review re-resolves to reviewer-code-review once reviewerAgreementsAckedAt is set).
// OTTER-643: Previous walks back to the decided proposal (/review/proposal), the loop-free analog of
// the researcher agreements → /submitted hop. Pointing it at /review would re-resolve to
// reviewer-code-review, whose own Previous comes back here — an agreements ⇄ code-review loop.
export function ReviewerAgreementsScreen({ study, orgSlug }: ScreenComponentProps) {
    const reviewHref = Routes.studyReview({ orgSlug, studyId: study.id })
    const previousHref = Routes.studyReviewProposal({ orgSlug, studyId: study.id })
    return (
        <Stack p="xl" gap="xxl">
            <StudyPageHeader>Study request</StudyPageHeader>
            <AgreementsPage
                isReviewer
                studyId={study.id}
                proceedHref={reviewHref}
                previousHref={previousHref}
                previousLabel="Previous"
            />
        </Stack>
    )
}
