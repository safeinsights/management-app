'use client'

import { Button, Group, Stack } from '@mantine/core'
import { addJobToStudyAction, onDeleteStudyJobAction } from '@/server/actions/study-request'
import React from 'react'
import { useForm } from '@mantine/form'
import { Routes } from '@/lib/routes'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { SelectedStudy } from '@/server/actions/study.actions'
import { useMutation, useQueryClient } from '@/common'
import { ResubmitCancelButton } from '@/components/resubmit-cancel-button'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { zodResolver } from 'mantine-form-zod-resolver'
import { reportMutationError } from '@/components/errors'
import { codeFilesSchema, StudyJobCodeFilesValues } from '../../request/study-proposal-form-schema'
import { actionResult } from '@/lib/utils'
import { errorToString, isActionError } from '@/lib/errors'
import logger from '@/lib/logger'
import { StudyCodeUpload } from '@/components/study-code-upload'

export function ResubmitStudyCodeForm(props: { study: SelectedStudy }) {
    const { study } = props
    const router = useRouter()
    const queryClient = useQueryClient()
    const studyUploadForm = useForm<StudyJobCodeFilesValues>({
        validate: zodResolver(codeFilesSchema),
        initialValues: {
            mainCodeFile: null,
            additionalCodeFiles: [],
        },
    })

    const orgSlug = study.submittedByOrgSlug
    if (!orgSlug) {
        throw new Error('Submitting organization not found for study')
    }

    const { isPending, mutate: resubmitStudy } = useMutation({
        mutationFn: async (formValues: StudyJobCodeFilesValues) => {
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
            router.push(Routes.studyView({ orgSlug, studyId: study.id }))
        },
        onError: reportMutationError('Failed to resubmit study'),
    })

    return (
        <form onSubmit={studyUploadForm.onSubmit((values) => resubmitStudy(values))}>
            <Stack>
                <StudyCodeUpload
                    studyUploadForm={studyUploadForm}
                    orgSlug={study.orgSlug}
                    language={study.language}
                    studyId={study.id}
                />

                <Group justify="flex-end" mt="md">
                    <ResubmitCancelButton
                        isDirty={studyUploadForm.isDirty()}
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
