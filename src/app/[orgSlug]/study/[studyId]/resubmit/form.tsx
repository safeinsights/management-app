'use client'

import { Button, Group, Stack } from '@mantine/core'
import { addJobToStudyAction, onDeleteStudyJobAction } from '../../request/actions'
import React from 'react'
import { useForm } from '@mantine/form'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { SelectedStudy } from '@/server/actions/study.actions'
import { useMutation, useQueryClient } from '@/common'
import { ResubmitCancelButton } from '@/components/resubmit-cancel-button'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { zodResolver } from 'mantine-form-zod-resolver'
import { reportMutationError } from '@/components/errors'
import { ResubmitProposalFormValues } from '@/schema/study-proposal'
import { z } from 'zod'
import { actionResult } from '@/lib/utils'
import { errorToString, isActionError } from '@/lib/errors'
import logger from '@/lib/logger'
import { StudyCodeUpload } from '@/components/study-code-upload'
import { Routes } from '@/lib/routes'

const resubmitStudySchema = z.object({
    mainCodeFile: z.instanceof(File, { message: 'Please upload a main code file to resubmit.' }).or(z.null()),
    additionalCodeFiles: z.array(z.instanceof(File)).default([]),
})

export function ResubmitStudyCodeForm(props: { study: SelectedStudy; orgSlug: string }) {
    const { study, orgSlug } = props
    const router = useRouter()
    const queryClient = useQueryClient()
    const studyProposalForm = useForm<ResubmitProposalFormValues>({
        validate: zodResolver(resubmitStudySchema),
        initialValues: {
            mainCodeFile: null,
            additionalCodeFiles: [],
        },
    })

    const { isPending, mutate: resubmitStudy } = useMutation({
        mutationFn: async (formValues: ResubmitProposalFormValues) => {
            const { urlForCodeUpload, studyJobId } = actionResult(
                await addJobToStudyAction({
                    studyId: study.id,
                    mainCodeFileName: formValues.mainCodeFile!.name,
                    codeFileNames: formValues.additionalCodeFiles.map((f) => f.name),
                }),
            )
            try {
                await uploadFiles([
                    [formValues.mainCodeFile, urlForCodeUpload],
                    ...formValues.additionalCodeFiles.map((f) => [f, urlForCodeUpload] as FileUpload),
                ])
            } catch (err: unknown) {
                const response = await onDeleteStudyJobAction({ studyJobId })
                if (isActionError(response)) {
                    logger.error(
                        `Failed to remove temp study job details after upload failure: ${errorToString(response.error)}`,
                    )
                }
                throw err
            }
        },
        onSuccess() {
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            notifications.show({
                title: 'Study Resubmitted',
                message:
                    'Your study has been successfully resubmitted to the reviewing organization. Check your dashboard for status updates.',
                color: 'green',
            })
            router.push(`/researcher/study/${study.id}/review` as Route)
        },
        onError: reportMutationError('Failed to resubmit study'),
    })

    return (
        <form onSubmit={studyProposalForm.onSubmit((values: ResubmitProposalFormValues) => resubmitStudy(values))}>
            <Stack>
                <StudyCodeUpload studyProposalForm={studyProposalForm} />

                <Group justify="flex-end" mt="md">
                    <ResubmitCancelButton
                        isDirty={studyProposalForm.isDirty()}
                        disabled={isPending}
                        href={Routes.studyView({ orgSlug, studyId: study.id })}
                    />
                    <Button variant="filled" type="submit" loading={isPending}>
                        Resubmit study code
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}
