'use client'

import React from 'react'
import { Button, Group, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { CancelButton } from '@/components/cancel-button'
import { useForm } from '@mantine/form'
import { studyProposalFormSchema, StudyProposalFormValues } from './study-proposal-form-schema'
import { StudyProposalForm } from './study-proposal-form'
import { UploadStudyJobCode } from './upload-study-job-code'
import { useMutation } from '@tanstack/react-query'
import { onCreateStudyAction, onDeleteStudyAction } from './actions'
import { useRouter } from 'next/navigation'
import { StudyDocumentType } from '@/lib/types'
import { zodResolver } from 'mantine-form-zod-resolver'
import { CodeReviewManifest } from '@/lib/code-manifest'
import { PresignedPost } from '@aws-sdk/s3-presigned-post'
import { signedUrlForCodeUploadAction, signedUrlForStudyFileUploadAction } from '@/server/actions/s3.actions'
import logger from '@/lib/logger'
import { omit } from 'remeda'

// TODO @nathan, should we talk about local vs s3 storage?
//  Could we just use s3 locally and not have to switch on USING_S3 to simplify?
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

    if (!response.ok) {
        notifications.show({
            color: 'red',
            title: 'failed to upload file',
            message: await response.text(),
        })
    }

    return response.ok
}

async function uploadCodeFiles(files: File[], upload: PresignedPost, studyJobId: string) {
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

    await fetch(upload.url, {
        method: 'POST',
        body: body,
    })
}

export const StudyProposal: React.FC<{ memberSlug: string }> = ({ memberSlug }) => {
    const router = useRouter()

    const studyProposalForm = useForm<StudyProposalFormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(studyProposalFormSchema),
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
            // Don't send any actual files to the server action, because they can't handle the file sizes
            const valuesWithoutFiles = omit(formValues, [
                'agreementDocument',
                'descriptionDocument',
                'irbDocument',
                'codeFiles',
            ])

            // Has me thinking, why store docpath we could basically enforce a structure in s3 like:
            // study/studyId/agreementDocument/doc.pdf (if we enforced the name to be generic,
            // we wouldn't have to store it.) idk how important this is to users to have their own filenames
            // would be nice to have something for a filename they could download like:
            // <StudyTitle>AgreementDocument.pdf
            // <StudyTitle>IRBDocument.pdf... etc
            const valuesWithFilenames = {
                ...valuesWithoutFiles,
                descriptionDocPath: formValues.descriptionDocument?.name || '',
                agreementDocPath: formValues.agreementDocument?.name || '',
                irbDocPath: formValues.irbDocument?.name || '',
            }

            const { studyId, studyJobId } = await onCreateStudyAction({
                memberSlug,
                studyInfo: valuesWithFilenames,
            })

            // TODO retry N times https://stackoverflow.com/a/13239999
            try {
                if (formValues.irbDocument) {
                    const upload = await signedUrlForStudyFileUploadAction({
                        studyInfo: { studyId, memberSlug },
                        documentType: StudyDocumentType.IRB,
                        filename: formValues.irbDocument.name,
                    })

                    await uploadFile(formValues.irbDocument, upload)
                }

                if (formValues.agreementDocument?.name) {
                    const upload = await signedUrlForStudyFileUploadAction({
                        studyInfo: { studyId, memberSlug },
                        documentType: StudyDocumentType.AGREEMENT,
                        filename: formValues.agreementDocument.name,
                    })

                    await uploadFile(formValues.agreementDocument, upload)
                }

                if (formValues.descriptionDocument?.name) {
                    const upload = await signedUrlForStudyFileUploadAction({
                        studyInfo: { studyId, memberSlug },
                        documentType: StudyDocumentType.DESCRIPTION,
                        filename: formValues.descriptionDocument.name,
                    })

                    await uploadFile(formValues.descriptionDocument, upload)
                }

                const studyCodeUpload = await signedUrlForCodeUploadAction({
                    memberSlug,
                    studyId,
                    studyJobId,
                })

                await uploadCodeFiles(formValues.codeFiles, studyCodeUpload, studyJobId)
            } catch (error) {
                // roll back the study if uploads failed and let the user try again
                await onDeleteStudyAction({ studyId, studyJobId })
                notifications.show({ message: 'Something went wrong uploading your files.', color: 'red' })
                logger.error(error)
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
