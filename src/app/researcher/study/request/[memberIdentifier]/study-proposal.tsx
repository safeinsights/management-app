'use client'

import React from 'react'
import { Button, Group, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { CancelButton } from '@/components/cancel-button'
import { useForm } from '@mantine/form'
import {
    StudyProposalFormValues,
    studyProposalSchema,
    zodResolver,
} from '@/app/researcher/study/request/[memberIdentifier]/study-proposal-schema'
import { StudyProposalForm } from '@/app/researcher/study/request/[memberIdentifier]/study-proposal-form'
import { UploadStudyJobCode } from '@/app/researcher/study/request/[memberIdentifier]/upload-study-job-code'
import { useMutation } from '@tanstack/react-query'
import { onCreateStudyAction } from '@/app/researcher/study/request/[memberIdentifier]/actions'
import { useRouter } from 'next/navigation'
import { pathForStudyDocuments } from '@/lib/paths'
import { StudyDocumentType } from '@/lib/types'
import { getSignedURL } from '@/server/actions/s3.actions'

export const StudyProposal: React.FC<{ memberId: string }> = ({ memberId }) => {
    const router = useRouter()

    const studyProposalForm = useForm<StudyProposalFormValues>({
        validate: zodResolver(studyProposalSchema),
        validateInputOnBlur: true,
        initialValues: {
            title: '',
            piName: '',
            irbDocument: null,
            descriptionDocument: null,
            agreementDocument: null,
            codeFiles: [],
        },
    })

    const { mutate: createStudy } = useMutation({
        mutationFn: async (formValues: StudyProposalFormValues) => {
            const { studyId, studyJobId } = await onCreateStudyAction({ memberId, studyInfo: formValues })
            if (formValues.irbDocument?.name) {
                const url = await getSignedURL(
                    pathForStudyDocuments(
                        { studyId, memberIdentifier: memberId },
                        StudyDocumentType.IRB,
                        formValues.irbDocument.name,
                    ),
                )

                const fileUpload = await fetch(url, {
                    method: 'PUT',
                    body: formValues.irbDocument,
                })

                console.log(fileUpload)
            }
            // do uploads here if study creation was successful?
        },
        onSuccess() {
            notifications.show({
                title: 'Study Proposal Submitted',
                message:
                    'Your proposal has been successfully submitted to the reviewing organization. Check your dashboard for status updates.',
                color: 'green',
            })
            router.push(`/researcher/dashboard`)
        },
        onError(error) {
            console.error(error)
            notifications.show({ message: String(error), color: 'red' })
        },
    })

    // const removeAllFiles = async () => {
    //     const values = studyProposalForm.getValues()
    //     if (values.irbDocument) {
    //         await deleteS3File(
    //             pathForStudyDocuments(
    //                 { studyId, memberIdentifier: memberId },
    //                 StudyDocumentType.IRB,
    //                 values.irbDocument?.name,
    //             ),
    //         )
    //     }
    //
    //     if (values.descriptionDocument) {
    //         await deleteS3File(
    //             pathForStudyDocuments(
    //                 { studyId, memberIdentifier: memberId },
    //                 StudyDocumentType.IRB,
    //                 values.descriptionDocument?.name,
    //             ),
    //         )
    //     }
    //
    //     if (values.agreementDocument) {
    //         await deleteS3File(
    //             pathForStudyDocuments(
    //                 { studyId, memberIdentifier: memberId },
    //                 StudyDocumentType.IRB,
    //                 values.agreementDocument?.name,
    //             ),
    //         )
    //     }
    // }

    // for (const codeFile of values.codeFiles) {
    //     await deleteS3File(
    //         pathForStudyCode(
    //             { studyId, memberIdentifier: memberId },
    //             StudyDocumentType.IRB,
    //             values.agreementDocument?.name,
    //         ),
    //     )
    // }

    return (
        <form onSubmit={studyProposalForm.onSubmit((values: StudyProposalFormValues) => createStudy(values))}>
            <Stack>
                <StudyProposalForm studyProposalForm={studyProposalForm} />
                <UploadStudyJobCode studyProposalForm={studyProposalForm} />
                <Group justify="center">
                    {studyProposalForm.errors['totalFileSize'] && (
                        <Text c="red">{studyProposalForm.errors['totalFileSize']}</Text>
                    )}
                </Group>
                <Group gap="xl" justify="flex-end">
                    {/* TODO Talk about removing cancel button, next/back buttons, submit button layout with UX */}
                    <CancelButton isDirty={studyProposalForm.isDirty()} />
                    <Button disabled={!studyProposalForm.isValid} type="submit" variant="filled">
                        Submit
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}
