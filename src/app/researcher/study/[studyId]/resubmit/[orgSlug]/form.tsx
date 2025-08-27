'use client'

import { Button, Group, Stack } from '@mantine/core'
import { addJobToStudyAction } from '@/app/researcher/study/request/[orgSlug]/actions'
import React from 'react'
import { useForm } from '@mantine/form'
import { UploadStudyJobCode } from '@/app/researcher/study/request/[orgSlug]/upload-study-job-code'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { SelectedStudy } from '@/server/actions/study.actions'
import { useMutation } from '@tanstack/react-query'
import { CancelButton } from '@/components/cancel-button'
import { useUploadFile } from '@/hooks/upload'
import z from 'zod'
import { zodResolver } from 'mantine-form-zod-resolver'
import { reportMutationError } from '@/components/errors'

const resubmitStudySchema = z.object({
    mainCodeFile: z.instanceof(File, { message: 'Please upload a main code file to resubmit.' }),
    additionalCodeFiles: z.array(z.instanceof(File)).default([]),
})

type ResubmitStudyFormValues = z.infer<typeof resubmitStudySchema>

export function ResubmitStudyCodeForm(props: { study: SelectedStudy }) {
    const { study } = props
    const router = useRouter()

    const studyProposalForm = useForm<ResubmitStudyFormValues>({
        validate: zodResolver(resubmitStudySchema),
        initialValues: {
            mainCodeFile: null,
            additionalCodeFiles: [],
        },
    })

    const { mutateAsync: uploadFile } = useUploadFile()

    const { isPending, mutate: resubmitStudy } = useMutation({
        mutationFn: async (formValues: ResubmitStudyFormValues) => {
            const { urlForMainCodeUpload, urlForAdditionalCodeUpload } = await addJobToStudyAction({
                studyId: study.id,
                mainCodeFileName: formValues.mainCodeFile!.name,
                codeFileNames: formValues.additionalCodeFiles.map((f) => f.name),
            })

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
        <form onSubmit={studyProposalForm.onSubmit((values: ResubmitStudyFormValues) => resubmitStudy(values))}>
            <Stack>
                <UploadStudyJobCode studyProposalForm={studyProposalForm} resubmit />

                <Group justify="flex-end" mt="md">
                    <CancelButton isDirty={studyProposalForm.isDirty()} />
                    <Button variant="filled" type="submit" loading={isPending}>
                        Resubmit study code
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}
