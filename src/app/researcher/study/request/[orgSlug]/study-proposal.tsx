'use client'

import React, { useState } from 'react'
import { Button, Group, Stepper } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { CancelButton } from '@/components/cancel-button'
import { useForm } from '@mantine/form'
import { studyProposalFormSchema, codeFilesSchema, StudyProposalFormValues } from './study-proposal-form-schema'
import { StudyProposalForm } from './study-proposal-form'
import { UploadStudyJobCode } from './upload-study-job-code'
import { useMutation } from '@tanstack/react-query'
import { upsertStudyAction, onDeleteStudyAction } from './actions'
import { useRouter } from 'next/navigation'
import { zodResolver } from 'mantine-form-zod-resolver'
import { CodeReviewManifest } from '@/lib/code-manifest'
import { PresignedPost } from '@aws-sdk/s3-presigned-post'
import { omit } from 'remeda'

type StepperButtonsProps = {
    form: { isValid(): boolean }
    stepIndex: number
    isPending: boolean
    setStepIndex: (i: number) => void
}

const StepperButtons: React.FC<StepperButtonsProps> = ({ form, stepIndex, isPending, setStepIndex }) => {
    const isValid = form.isValid()

    if (stepIndex == 0) {
        return (
            <Button
                type="button"
                variant="primary"
                disabled={!isValid || isPending}
                onClick={(e) => {
                    e.preventDefault()
                    setStepIndex(stepIndex + 1)
                }}
            >
                Next Step
            </Button>
        )
    }

    if (stepIndex == 1) {
        return (
            <Button disabled={!isValid || isPending} type="submit" variant="primary">
                Submit
            </Button>
        )
    }
    return null
}

export async function uploadFile(file: File, upload: PresignedPost) {
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
    const [stepIndex, setStepIndex] = useState(0)

    const router = useRouter()
    const studyProposalForm = useForm<StudyProposalFormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(stepIndex == 0 ? studyProposalFormSchema : codeFilesSchema),
        initialValues: {
            title: '',
            piName: '',
            irbDocument: null,
            descriptionDocument: null,
            agreementDocument: null,
            mainCodeFile: null,
            additionalCodeFiles: [],
        },
        validateInputOnChange: [
            'title',
            'piName',
            'descriptionDocument',
            'irbDocument',
            'agreementDocument',
            'mainCodeFile',
            'additionalCodeFiles',
        ],
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
                mainCodeFilePath: formValues.mainCodeFile!.name,
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
            } = await upsertStudyAction({
                orgSlug,
                studyInfo: valuesWithFilenames,
                mainCodeFileName: formValues.mainCodeFile!.name,
                codeFileNames: formValues.additionalCodeFiles.map((file) => file.name),
            })
            await uploadFile(formValues.irbDocument!, urlForIrbUpload)
            await uploadFile(formValues.agreementDocument!, urlForAgreementUpload)
            await uploadFile(formValues.descriptionDocument!, urlForDescriptionUpload)
            await uploadCodeFiles([formValues.mainCodeFile!], urlForMainCodeUpload, studyJobId)
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

    return (
        <form onSubmit={studyProposalForm.onSubmit((values: StudyProposalFormValues) => createStudy(values))}>
            <Stepper
                unstyled
                active={stepIndex}
                styles={{
                    steps: {
                        display: 'none',
                    },
                }}
            >
                <Stepper.Step>
                    <StudyProposalForm studyProposalForm={studyProposalForm} />
                </Stepper.Step>

                <Stepper.Step>
                    <UploadStudyJobCode studyProposalForm={studyProposalForm} />
                </Stepper.Step>
            </Stepper>

            <Group mt="xxl" style={{ width: '100%' }}>
                {stepIndex === 1 && (
                    <Button type="button" variant="outline" onClick={() => setStepIndex(stepIndex - 1)}>
                        Back
                    </Button>
                )}

                <Group style={{ marginLeft: 'auto' }}>
                    <CancelButton isDirty={studyProposalForm.isDirty()} />
                    <StepperButtons
                        form={studyProposalForm}
                        stepIndex={stepIndex}
                        isPending={isPending}
                        setStepIndex={setStepIndex}
                    />
                </Group>
            </Group>
        </form>
    )
}
