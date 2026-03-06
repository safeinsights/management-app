'use client'

import { useProposalReviewMutation } from '@/hooks/use-proposal-review-mutation'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { Button, Group } from '@mantine/core'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import type { FC } from 'react'

type ProposalReviewButtonsProps = {
    study: SelectedStudy
    orgSlug: string
    agreementsHref?: string
}

export const ProposalReviewButtons: FC<ProposalReviewButtonsProps> = ({ study, orgSlug, agreementsHref }) => {
    const router = useRouter()
    const { updateStudy, isPending, isSuccess, pendingStatus } = useProposalReviewMutation({
        studyId: study.id,
        orgSlug,
    })

    if (study.status === 'APPROVED' || study.status === 'REJECTED') {
        return agreementsHref ? (
            <Group justify="flex-end">
                <Button onClick={() => router.push(agreementsHref as Route)}>Proceed to Step 2</Button>
            </Group>
        ) : null
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
