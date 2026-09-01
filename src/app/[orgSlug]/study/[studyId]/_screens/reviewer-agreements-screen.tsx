import { Stack } from '@mantine/core'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { AgreementsPage } from '../agreements/agreements-page'
import type { ScreenComponentProps } from './types'

// OTTER-727: hidden — nothing renders this, but it is retained while the agreements direction is
// undecided. Previous points at /review/proposal because bare /review would loop back here.
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
