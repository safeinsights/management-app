'use client'

import { useLegacyProposalReviewMutation } from '@/hooks/use-legacy-proposal-review-mutation'
import { isSubmittedProposalReviewStatus } from '@/lib/proposal-review'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { Button, Group } from '@mantine/core'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import type { FC } from 'react'

type ProposalReviewButtonsProps = {
    study: SelectedStudy
    orgSlug: string
    agreementsHref?: string
}

export const ProposalReviewButtons: FC<ProposalReviewButtonsProps> = ({ study, orgSlug, agreementsHref }) => {
    const router = useRouter()
    const { updateStudy, isPending, isSuccess, pendingStatus } = useLegacyProposalReviewMutation({
        studyId: study.id,
        orgSlug,
    })

    // When navigating from agreements, show only the forward navigation button —
    // the reviewer is viewing the proposal for reference, not re-reviewing it
    if (agreementsHref) {
        return (
            <Group justify="flex-end">
                <Button onClick={() => router.push(agreementsHref as Route)}>Proceed to Step 2</Button>
            </Group>
        )
    }

    if (isSubmittedProposalReviewStatus(study.status)) {
        return null
    }

    return (
        <Group justify="flex-end">
            <Button
                disabled={isPending || isSuccess}
                loading={isPending && pendingStatus === 'REJECTED'}
                onClick={() => updateStudy('REJECTED')}
                variant="outline"
            >
                Reject request
            </Button>
            <Button
                disabled={isPending || isSuccess}
                loading={isPending && pendingStatus === 'APPROVED'}
                onClick={() => updateStudy('APPROVED')}
            >
                Approve request
            </Button>
        </Group>
    )
}
