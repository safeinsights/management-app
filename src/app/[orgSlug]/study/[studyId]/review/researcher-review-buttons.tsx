'use client'

import { useMutation, useQueryClient } from '@/common'
import { reportMutationError } from '@/components/errors'
import { Button, Group } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { FC } from 'react'
import { saveStudyAsDraftAction, submitStudyAction } from './actions'
import { type SelectedStudy } from '@/server/actions/study.actions'
import { Routes } from '@/lib/routes'
import { logger } from '@sentry/nextjs'

export const ResearcherReviewButtons: FC<{ study: SelectedStudy }> = ({ study }) => {
    const router = useRouter()
    const queryClient = useQueryClient()

    const { mutate: submit, isPending: isSubmitting } = useMutation({
        mutationFn: () => submitStudyAction({ studyId: study.id }),
        onError: reportMutationError('Failed to submit study'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', study.orgSlug] })
            router.push(Routes.orgDashboard({ orgSlug: study.orgSlug }))
        },
    })

    const { mutate: saveAsDraft, isPending: isSaving } = useMutation({
        mutationFn: () => saveStudyAsDraftAction({ studyId: study.id }),
        onError: reportMutationError('Failed to save study as draft'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['org-studies', study.orgSlug] })
            logger.info(`Study ${study.id} saved as draft`)
        },
    })

    return (
        <Group justify="flex-end">
            <Button
                variant="outline"
                onClick={() => saveAsDraft()}
                disabled={isSubmitting || isSaving}
                loading={isSaving}
            >
                Save as draft
            </Button>
            <Button onClick={() => submit()} disabled={isSubmitting || isSaving} loading={isSubmitting}>
                Submit study
            </Button>
        </Group>
    )
}
