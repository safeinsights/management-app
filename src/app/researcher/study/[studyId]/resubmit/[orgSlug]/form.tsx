'use client'

import { Button, Group, Stack } from '@mantine/core'
import { addJobToStudyAction } from '@/app/researcher/study/request/[orgSlug]/actions'
import React from 'react'
import { useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { SelectedStudy } from '@/server/actions/study.actions'
import { useMutation } from '@tanstack/react-query'
import { ResubmitCancelButton } from '@/components/resubmit-cancel-button'
import { useUploadFile } from '@/hooks/upload'
import { zodResolver } from 'mantine-form-zod-resolver'
import { reportMutationError } from '@/components/errors'
import { ResubmitProposalFormValues } from '../../../request/[orgSlug]/study-proposal-form-schema'
import { PresignedPost } from '@aws-sdk/s3-presigned-post'
import { z } from 'zod'
import { ReuploadCode } from './reupload-code'

const resubmitStudySchema = z.object({
    mainCodeFile: z.instanceof(File, { message: 'Please upload a main code file to resubmit.' }).or(z.null()),
    additionalCodeFiles: z.array(z.instanceof(File)).default([]),
})

export function ResubmitStudyCodeForm(props: { study: SelectedStudy }) {
    const { study } = props
    const router = useRouter()

    const studyProposalForm = useForm<ResubmitProposalFormValues>({
        validate: zodResolver(resubmitStudySchema),
        initialValues: {
            mainCodeFile: null,
            additionalCodeFiles: [],
        },
    })

    const { mutateAsync: uploadFile } = useUploadFile()

    const { isPending, mutate: resubmitStudy } = useMutation({
        mutationFn: async (formValues: ResubmitProposalFormValues) => {
            const actionResponse = (await addJobToStudyAction({
                studyId: study.id,
                orgSlug: study.orgSlug,
                mainCodeFileName: formValues.mainCodeFile!.name,
                codeFileNames: formValues.additionalCodeFiles.map((f) => f.name),
            })) as {
                studyId: string
                studyJobId: string
                urlForMainCodeUpload: PresignedPost
                urlForAdditionalCodeUpload: PresignedPost
            }
            const { urlForMainCodeUpload, urlForAdditionalCodeUpload } = actionResponse

            await uploadFile({ file: formValues.mainCodeFile!, upload: urlForMainCodeUpload })

            for (const file of formValues.additionalCodeFiles) {
                await uploadFile({ file: file, upload: urlForAdditionalCodeUpload })
            }
        },
        onSuccess() {
            notifications.show({
                title: 'Study Resubmitted',
                message:
                    'Your study has been successfully resubmitted to the reviewing organization. Check your dashboard for status updates.',
                color: 'green',
            })
            router.push(`/researcher/study/${study.id}/review`)
        },
        onError: reportMutationError('Failed to resubmit study'),
    })

    return (
        <form onSubmit={studyProposalForm.onSubmit((values: ResubmitProposalFormValues) => resubmitStudy(values))}>
            <Stack>
                <ReuploadCode studyProposalForm={studyProposalForm} />

                <Group justify="flex-end" mt="md">
                    <ResubmitCancelButton
                        isDirty={studyProposalForm.isDirty()}
                        disabled={isPending}
                        href={`/researcher/study/${study.id}`}
                    />
                    <Button variant="filled" type="submit" loading={isPending}>
                        Resubmit study code
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}
