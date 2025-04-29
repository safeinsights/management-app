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
import { zodResolver } from 'mantine-form-zod-resolver'
import { CodeReviewManifest } from '@/lib/code-manifest'
import { PresignedPost } from '@aws-sdk/s3-presigned-post'
import { omit } from 'remeda'

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
                descriptionDocPath: formValues.descriptionDocument!.name,
                agreementDocPath: formValues.agreementDocument!.name,
                irbDocPath: formValues.irbDocument!.name,
            }

            const {
                studyId,
                studyJobId,
                urlForCodeUpload,
                urlForAgreementUpload,
                urlForIrbUpload,
                urlForDescriptionUpload,
            } = await onCreateStudyAction({
                memberSlug,
                studyInfo: valuesWithFilenames,
            })

            await uploadFile(formValues.irbDocument!, urlForIrbUpload)
            await uploadFile(formValues.agreementDocument!, urlForAgreementUpload)
            await uploadFile(formValues.descriptionDocument!, urlForDescriptionUpload)
            await uploadCodeFiles(formValues.codeFiles, urlForCodeUpload, studyJobId)

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
        onError: async (error: unknown, _variables, context: { studyId: string; studyJobId: string } | undefined) => {
            console.error('Study proposal submission error:', error)

            let title = 'Submission Failed'
            let message = 'An unexpected error occurred.'
            let needsCleanup = false

            if (error instanceof Error && error.message.includes('You are not a member of this organization')) {
                title = 'Access Denied'
                message = 'You can only submit study proposals to organizations you are a member of.'
                needsCleanup = false
            } else if (context) {
                message = 'An error occurred during file upload or processing. The draft proposal has been removed.'
                needsCleanup = true
            }

            notifications.show({
                title: title,
                message: message,
                color: 'red',
            })

            if (needsCleanup && context) {
                try {
                    await onDeleteStudyAction({
                        memberSlug: memberSlug,
                        studyId: context.studyId,
                        studyJobId: context.studyJobId,
                    })
                    console.log(`Cleaned up study ${context.studyId} and job ${context.studyJobId} after error.`)
                } catch (cleanupError) {
                    console.error('Failed to cleanup study/job after initial error:', cleanupError)
                    notifications.show({
                        title: 'Cleanup Failed',
                        message: 'Failed to automatically clean up the draft proposal after an error. Please contact support.',
                        color: 'red',
                    })
                }
            }
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
