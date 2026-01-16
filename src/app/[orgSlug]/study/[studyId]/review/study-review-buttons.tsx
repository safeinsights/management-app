'use client'

import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import type { StudyStatus } from '@/database/types'
import {
    approveStudyProposalAction,
    rejectStudyProposalAction,
    type SelectedStudy,
} from '@/server/actions/study.actions'
import { Button, Group, Stack } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { FC, useState } from 'react'
import { TestImageCheckbox } from './test-image-checkbox'
import { Routes, useTypedParams } from '@/lib/routes'
import { useSession } from '@/hooks/session'

export const StudyReviewButtons: FC<{ study: SelectedStudy }> = ({ study }) => {
    const { session } = useSession()
    const router = useRouter()
    const { orgSlug } = useTypedParams(Routes.studyReview.schema)
    const [useTestImage, setUseTestImage] = useState(false)
    const queryClient = useQueryClient()

    const backPath = Routes.orgDashboard({ orgSlug })

    const {
        mutate: updateStudy,
        isPending,
        isSuccess,
        variables: pendingStatus,
    } = useMutation({
        mutationFn: (status: StudyStatus) => {
            if (status === 'APPROVED') {
                return approveStudyProposalAction({ orgSlug, studyId: study.id, useTestImage })
            }
            return rejectStudyProposalAction({ orgSlug, studyId: study.id })
        },
        onError: reportMutationError('Failed to update study status'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', orgSlug] })
            router.push(backPath)
        },
    })

    if (study.status === 'APPROVED' || study.status === 'REJECTED') {
        return null // do not show buttons if the study is already approved or rejected
    }

    return (
        <Stack>
            <Group justify="flex-end">
                <Button
                    disabled={isPending || isSuccess}
                    loading={isPending && pendingStatus == 'REJECTED'}
                    onClick={() => updateStudy('REJECTED')}
                    variant="outline"
                >
                    Reject
                </Button>
                <Button
                    disabled={isPending || isSuccess}
                    loading={isPending && pendingStatus == 'APPROVED'}
                    onClick={() => updateStudy('APPROVED')}
                >
                    Approve
                </Button>
            </Group>
            <TestImageCheckbox studyId={study.id} checked={useTestImage} onChange={setUseTestImage} />
        </Stack>
    )
}
