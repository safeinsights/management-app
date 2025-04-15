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
import {
    signedUrlForCodeUploadAction,
    signedUrlForDeletingStudyFilesAction,
    signedUrlForStudyFileUploadAction,
} from '@/server/actions/s3.actions'
import { omit } from 'remeda'
import { pathForStudy, pathForStudyDocuments } from '@/lib/paths'

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
            title: 'Failed to upload file',
            message: await response.text(),
        })
    }

    return response.ok
}

async function uploadCodeFiles(files: File[], upload: PresignedPost, studyJobId: string) {
    const manifest = new CodeReviewManifest(studyJobId, 'r')
    for (const codeFile of files) {
        manifest.files.push(codeFile)
        await uploadFile(codeFile, upload)
    }

    const manifestFile = new File([manifest.asJSON], 'manifest.json', { type: 'application/json' })
    return await uploadFile(manifestFile, upload)
}

export const StudyProposal: React.FC<{ memberSlug: string }> = ({ memberSlug }) => {
    const router = useRouter()

    const studyProposalForm = useForm<StudyProposalFormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(studyProposalFormSchema),
        initialValues: {
            title: '',
            piName: '',
            irbDocument: null,
            descriptionDocument: null,
            agreementDocument: null,
            codeFiles: [],
        },
    })

    const { isPending, mutate: createStudy } = useMutation({
        mutationFn: async (formValues: StudyProposalFormValues) => {
            // Don't send any actual files to the server action, because they can't handle the file sizes
            const valuesWithoutFiles = omit(formValues, [
                'agreementDocument',
                'descriptionDocument',
                'irbDocument',
                'codeFiles',
            ])

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

            if (formValues.irbDocument) {
                const path = pathForStudyDocuments({ studyId, memberSlug }, StudyDocumentType.IRB)
                const upload = await signedUrlForStudyFileUploadAction(path)

                const ok = await uploadFile(formValues.irbDocument, upload)
                if (!ok) return { studyId, studyJobId }
            }

            if (formValues.agreementDocument?.name) {
                const path = pathForStudyDocuments({ studyId, memberSlug }, StudyDocumentType.AGREEMENT)
                const upload = await signedUrlForStudyFileUploadAction(path)

                const ok = await uploadFile(formValues.agreementDocument, upload)
                if (!ok) return { studyId, studyJobId }
            }

            if (formValues.descriptionDocument?.name) {
                const path = pathForStudyDocuments({ studyId, memberSlug }, StudyDocumentType.DESCRIPTION)
                const upload = await signedUrlForStudyFileUploadAction(path)

                const ok = await uploadFile(formValues.descriptionDocument, upload)
                if (!ok) return { studyId, studyJobId }
            }

            const studyCodeUpload = await signedUrlForCodeUploadAction({
                memberSlug,
                studyId,
                studyJobId,
            })

            const ok = await uploadCodeFiles(formValues.codeFiles, studyCodeUpload, studyJobId)
            if (!ok) return { studyId, studyJobId }

            return { studyId, studyJobId }
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
        onError: async (error, _, context: { studyId: string; studyJobId: string } | undefined) => {
            console.error(error)
            if (!context) return
            const deletePath = pathForStudy({ memberSlug: memberSlug, studyId: context.studyId })
            const deleteStudyFilesURL = await signedUrlForDeletingStudyFilesAction(deletePath)
            await fetch(deleteStudyFilesURL)
            await onDeleteStudyAction({ studyId: context.studyId, studyJobId: context.studyJobId })
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
                    <Button disabled={!studyProposalForm.isValid || isPending} type="submit" variant="filled">
                        Submit
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}
