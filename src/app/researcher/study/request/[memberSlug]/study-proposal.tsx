'use client'

import React from 'react'
import { Button, Group, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { CancelButton } from '@/components/cancel-button'
import { useForm } from '@mantine/form'
import { StudyProposalFormValues, studyProposalSchema } from './study-proposal-schema'
import { StudyProposalForm } from './study-proposal-form'
import { UploadStudyJobCode } from './upload-study-job-code'
import { useMutation } from '@tanstack/react-query'
import { onCreateStudyAction } from './actions'
import { useRouter } from 'next/navigation'
import { StudyDocumentType } from '@/lib/types'
import { signedUrlForCodeUpload, signedUrlForStudyFileUpload } from '@/server/actions/s3.actions'
import { zodResolver } from 'mantine-form-zod-resolver'
import { CodeReviewManifest } from '@/lib/code-manifest'
import { PresignedPost } from '@aws-sdk/s3-presigned-post'

async function uploadFile(file: File, upload: PresignedPost) {
    const body = new FormData()
    for (const [key, value] of Object.entries(upload.fields)) {
        body.append(key, value)
    }
    body.append('file', file)

    const response = await fetch(upload.url, {
        method: 'POST',
        body,
    })

    console.log('Response: ', response, 'Body: ', body)

    if (!response.ok) {
        notifications.show({
            color: 'red',
            title: 'failed to upload file',
            message: await response.text(),
        })
    }

    return response.ok
}

async function uploadCodeFiles(files: File[], upload: PresignedPost, studyJobId) {
    const manifest = new CodeReviewManifest(studyJobId, 'r')
    const body = new FormData()
    for (const [key, value] of Object.entries(upload.fields)) {
        body.append(key, value)
    }
    for (const codeFile of files) {
        manifest.files.push(codeFile)
        body.append('file', codeFile)
    }

    const manifestFile = new File([manifest.asJSON], 'manifest.json', { type: 'application/json' })
    body.append(manifestFile.name, manifestFile)

    const codeUpload = await fetch(upload.url, {
        method: 'POST',
        body: body,
    })

    console.log(codeUpload)
}

export const StudyProposal: React.FC<{ memberSlug: string }> = ({ memberSlug }) => {
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
            const { studyId, studyJobId } = await onCreateStudyAction({ memberSlug, studyInfo: formValues })

            try {
                if (formValues.irbDocument) {
                    const upload = await signedUrlForStudyFileUpload(
                        { studyId, memberSlug },
                        StudyDocumentType.IRB,
                        formValues.irbDocument.name,
                    )

                    await uploadFile(formValues.irbDocument, upload)
                }

                if (formValues.agreementDocument?.name) {
                    const upload = await signedUrlForStudyFileUpload(
                        { studyId, memberSlug },
                        StudyDocumentType.AGREEMENT,
                        formValues.agreementDocument.name,
                    )

                    await uploadFile(formValues.agreementDocument, upload)
                }

                if (formValues.descriptionDocument?.name) {
                    const upload = await signedUrlForStudyFileUpload(
                        { studyId, memberSlug },
                        StudyDocumentType.DESCRIPTION,
                        formValues.descriptionDocument.name,
                    )

                    await uploadFile(formValues.descriptionDocument, upload)
                }

                const studyCodeUpload = await signedUrlForCodeUpload({
                    memberSlug,
                    studyId,
                    studyJobId,
                })

                await uploadCodeFiles(formValues.codeFiles, studyCodeUpload, studyJobId)
            } catch (error) {
                // IF something goes wrong with study file uploads,
                //  do we want to roll back and delete the study?
                notifications.show({ message: String(error), color: 'red' })
            }
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
