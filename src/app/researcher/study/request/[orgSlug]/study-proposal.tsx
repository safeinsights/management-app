'use client'

import React, { useState } from 'react'
import { Button, Group, Stack, Text, Stepper } from '@mantine/core'
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
        throw new Error(`failed to upload file ${await response.text()}`)
    }
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

export const StudyProposal: React.FC<{ orgSlug: string }> = ({ orgSlug }) => {
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
            mainCodeFile: null,
            additionalCodeFiles: [],
        },
        validateInputOnChange: ['title', 'piName'],
    })

    const { isPending, mutate: createStudy } = useMutation({
        mutationFn: async (formValues: StudyProposalFormValues) => {
            // Don't send any actual files to the server action, because they can't handle the file sizes
            const valuesWithoutFiles = omit(formValues, [
                'agreementDocument',
                'descriptionDocument',
                'irbDocument',
                'mainCodeFile',
                'additionalCodeFiles',
            ])

            const valuesWithFilenames = {
                ...valuesWithoutFiles,
                descriptionDocPath: formValues.descriptionDocument!.name,
                agreementDocPath: formValues.agreementDocument!.name,
                irbDocPath: formValues.irbDocument!.name,
                mainCodeFilePath: formValues.mainCodeFile.map((file) => file.name),
                additionalCodeFilePaths: formValues.additionalCodeFiles.map((file) => file.name),
            }

            const {
                studyId,
                studyJobId,
                urlForMainCodeUpload,
                urlForAdditionalCodeUpload,
                urlForAgreementUpload,
                urlForIrbUpload,
                urlForDescriptionUpload,
            } = await onCreateStudyAction({
                orgSlug,
                studyInfo: valuesWithFilenames,
            })
            await uploadFile(formValues.irbDocument!, urlForIrbUpload)
            await uploadFile(formValues.agreementDocument!, urlForAgreementUpload)
            await uploadFile(formValues.descriptionDocument!, urlForDescriptionUpload)
            await uploadCodeFiles(formValues.mainCodeFile, urlForMainCodeUpload, studyJobId)
            await uploadCodeFiles(formValues.additionalCodeFiles, urlForAdditionalCodeUpload, studyJobId)
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
            notifications.show({
                color: 'red',
                title: 'Failed to upload file',
                message: error.message,
            })
            if (!context) return

            await onDeleteStudyAction({
                orgSlug: orgSlug,
                studyId: context.studyId,
                studyJobId: context.studyJobId,
            })
        },
    })

    const steps = [{ label: 'Study Proposal' }, { label: 'Study Code' }]
    //Form step management
    const [activeStep, setActiveStep] = useState(0)

    const nextStep = () => {
        setActiveStep((current) => (current < steps.length - 1 ? current + 1 : current))
    }

    const isStepValid = (step: number) => {
        if (step === 0) {
            // Check if the form is valid at step 0
            return (
                studyProposalForm.isValid('title') &&
                studyProposalForm.isValid('piName') &&
                studyProposalForm.isValid('agreementDocument') &&
                studyProposalForm.isValid('irbDocument') &&
                studyProposalForm.isValid('descriptionDocument')
            )
        } else if (step === 1) {
            // Check if the form is valid at step 1. We only need to check the main code file since uplodadng additional code files is optional
            return studyProposalForm.isValid('mainCodeFile')
        }
        return false
    }
    return (
        <form onSubmit={studyProposalForm.onSubmit((values: StudyProposalFormValues) => createStudy(values))}>
            <Stepper active={activeStep} onStepClick={setActiveStep} gap={0}>
                {/* Empty Stepper steps to hide indicators */}
            </Stepper>

            {activeStep === 0 && (
                <Stack>
                    <StudyProposalForm studyProposalForm={studyProposalForm} />
                    <Group justify="flex-end">
                        <CancelButton isDirty={studyProposalForm.isDirty()} />
                        <Button
                            disabled={!studyProposalForm.isValid || isPending || !isStepValid(0)}
                            onClick={nextStep}
                        >
                            Next Step
                        </Button>
                    </Group>
                </Stack>
            )}

            {activeStep === 1 && (
                <Stack mt="xl">
                    <UploadStudyJobCode studyProposalForm={studyProposalForm} />
                    <Group justify="center">
                        {studyProposalForm.errors['totalFileSize'] && (
                            <Text c="red">{studyProposalForm.errors['totalFileSize']}</Text>
                        )}
                    </Group>
                    <Group justify="flex-end">
                        <CancelButton isDirty={studyProposalForm.isDirty()} />
                        <Button
                            disabled={!studyProposalForm.isValid || isPending || !isStepValid(1)}
                            type="submit"
                            variant="filled"
                        >
                            Submit
                        </Button>
                    </Group>
                </Stack>
            )}
        </form>
    )
}
