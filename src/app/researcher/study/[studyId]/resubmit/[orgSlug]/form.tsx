'use client'

import { Button, Group, Stack } from '@mantine/core'
import { addJobToStudyAction } from '@/app/researcher/study/request/[orgSlug]/actions'
import React from 'react'
import { useForm } from '@mantine/form'
import { StudyProposalFormValues } from '@/app/researcher/study/request/[orgSlug]/study-proposal-form-schema'
import { UploadStudyJobCode } from '@/app/researcher/study/request/[orgSlug]/upload-study-job-code'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { SelectedStudy } from '@/server/actions/study.actions'
import { useMutation } from '@tanstack/react-query'
import { CancelButton } from '@/components/cancel-button'
import { uploadFile } from '../../../request/[orgSlug]/study-proposal'
import z from 'zod'
import { zodResolver } from 'mantine-form-zod-resolver'

export function ResubmitStudyCodeForm(props: { study: SelectedStudy }) {
    const { study } = props
    const router = useRouter()

    const resubmitStudySchema = z.object({
        title: z.string(),
        piName: z.string(),
        descriptionDocument: z.nullable(z.instanceof(File)).optional(),
        irbDocument: z.nullable(z.instanceof(File)).optional(),
        agreementDocument: z.nullable(z.instanceof(File)).optional(),
        mainCodeFile: z.instanceof(File, { message: 'Please upload a main code file to resubmit.' }),
        additionalCodeFiles: z.array(z.instanceof(File)).default([]),
    })

    const studyProposalForm = useForm<StudyProposalFormValues>({
        validate: zodResolver(resubmitStudySchema),
        initialValues: {
            title: study.title,
            piName: study.piName,
            descriptionDocument: null,
            irbDocument: null,
            agreementDocument: null,
            mainCodeFile: null,
            additionalCodeFiles: [],
        },
    })

    const { isPending, mutate: resubmitStudy } = useMutation({
        mutationFn: async (formValues: StudyProposalFormValues) => {
            const { urlForMainCodeUpload, urlForAdditionalCodeUpload } = await addJobToStudyAction({
                studyId: study.id,
                orgSlug: study.orgSlug,
                mainCodeFileName: formValues.mainCodeFile!.name,
                codeFileNames: formValues.additionalCodeFiles.map((f) => f.name),
            })

            await uploadFile(formValues.mainCodeFile!, urlForMainCodeUpload)

            for (const file of formValues.additionalCodeFiles) {
                await uploadFile(file, urlForAdditionalCodeUpload)
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
        onError: (error) => {
            notifications.show({
                color: 'red',
                title: 'Failed to resubmit study',
                message: error.message,
            })
        },
    })

    return (
        <form onSubmit={studyProposalForm.onSubmit((values: StudyProposalFormValues) => resubmitStudy(values))}>
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
