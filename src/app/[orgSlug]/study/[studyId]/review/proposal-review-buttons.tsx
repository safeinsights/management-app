'use client'

import { useProposalReviewMutation } from '@/hooks/use-proposal-review-mutation'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { Button, Group } from '@mantine/core'
import type { FC } from 'react'

export const ProposalReviewButtons: FC<{ study: SelectedStudy; orgSlug: string }> = ({ study, orgSlug }) => {
    const { updateStudy, isPending, isSuccess, pendingStatus } = useProposalReviewMutation({
        studyId: study.id,
        orgSlug,
    })

    if (study.status === 'APPROVED' || study.status === 'REJECTED') {
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
