'use client'

import React, { useState } from 'react'
import { Button, Group, Stepper } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { CancelButton } from '@/components/cancel-button'
import { useForm } from '@mantine/form'
import { studyProposalFormSchema, codeFilesSchema, StudyProposalFormValues } from './study-proposal-form-schema'
import { StudyProposalForm } from './study-proposal-form'
import { UploadStudyJobCode } from './upload-study-job-code'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { onCreateStudyAction, onDeleteStudyAction } from './actions'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@/components/common'
import { actionResult } from '@/lib/utils'
import { PresignedPost } from '@aws-sdk/s3-presigned-post'
import { omit } from 'remeda'
<<<<<<< HEAD
import { useUploadFile } from '@/hooks/upload'
=======
import logger from '@/lib/logger'
<<<<<<< HEAD
>>>>>>> 61bb8359 (upload using XMLHttpRequest)
=======
import { errorToString, isActionError } from '@/lib/errors'
>>>>>>> 9e47cd72 (ensure tmp study is deleted if files fail to upload)

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


async function uploadFile(file: File, upload: PresignedPost) {
    const body = new FormData()
    for (const [key, value] of Object.entries(upload.fields)) {
        body.append(key, value)
    }
    body.append('file', file)
    const failureMsg = `failed to upload file ${file.name}.  please remove it and attempt to re-upload`
    try {
        const response = await fetch(upload.url, {
            method: 'POST',
            body,
        })
        if (!response.ok) {
            logger.error(`Upload failed with status ${response.status}: ${response.statusText}`)
            throw new Error(failureMsg)
        }
    } catch (error) {
        logger.error(`Upload error: ${error}`)
        throw new Error(failureMsg)
    }
}

type FileUpload = [File | null, PresignedPost]

function uploadFiles(files: FileUpload[]) {
    return Promise.all(
        files.map(([file, upload]) => {
            if (!file) return Promise.resolve(null)
            return uploadFile(file, upload)
        }),
    )
}

// we do not want to  send any actual files, only their paths to the server action,
// they will be uploaded after study is created
function formValuesToStudyInfo(formValues: StudyProposalFormValues) {
    return {
        ...omit(formValues, [
            'agreementDocument',
            'descriptionDocument',
            'irbDocument',
            'mainCodeFile',
            'additionalCodeFiles',
        ]),
        descriptionDocPath: formValues.descriptionDocument!.name,
        agreementDocPath: formValues.agreementDocument!.name,
        irbDocPath: formValues.irbDocument!.name,
        mainCodeFilePath: formValues.mainCodeFile!.name,
        additionalCodeFilePaths: formValues.additionalCodeFiles.map((file) => file.name),
    }
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

    const { mutateAsync: uploadFile } = useUploadFile()
    const queryClient = useQueryClient()

    const { isPending, mutate: createStudy } = useMutation({
        mutationFn: async (formValues: StudyProposalFormValues) => {
            const { studyId, studyJobId, ...urls } = actionResult(
                await onCreateStudyAction({
                    orgSlug,
                    studyInfo: formValuesToStudyInfo(formValues),
                    mainCodeFileName: formValues.mainCodeFile!.name,
                    codeFileNames: formValues.additionalCodeFiles.map((file) => file.name),
                }),
            )
<<<<<<< HEAD
<<<<<<< HEAD
            await uploadFile({ file: formValues.irbDocument!, upload: urlForIrbUpload })
            await uploadFile({ file: formValues.agreementDocument!, upload: urlForAgreementUpload })
            await uploadFile({ file: formValues.descriptionDocument!, upload: urlForDescriptionUpload })
            await uploadCodeFiles([formValues.mainCodeFile!], urlForMainCodeUpload, studyJobId, uploadFile)
            await uploadCodeFiles(formValues.additionalCodeFiles, urlForAdditionalCodeUpload, studyJobId, uploadFile)
=======
            const uploads: Promise<File>[] = []
            uploads.push(uploadFile(formValues.irbDocument!, urlForIrbUpload))
            uploads.push(uploadFile(formValues.agreementDocument!, urlForAgreementUpload))
            uploads.push(uploadFile(formValues.descriptionDocument!, urlForDescriptionUpload))
            uploadCodeFiles(uploads, [formValues.mainCodeFile!], urlForMainCodeUpload, studyJobId)
            uploadCodeFiles(uploads, formValues.additionalCodeFiles, urlForAdditionalCodeUpload, studyJobId)
            await Promise.all(uploads)

>>>>>>> 61bb8359 (upload using XMLHttpRequest)
            return { studyId, studyJobId }
=======

            try {
                await uploadFiles([
                    [formValues.irbDocument, urls.urlForAdditionalCodeUpload],
                    [formValues.agreementDocument, urls.urlForAdditionalCodeUpload],
                    [formValues.descriptionDocument, urls.urlForAgreementUpload],
                    [formValues.mainCodeFile, urls.urlForMainCodeUpload],
                    ...formValues.additionalCodeFiles.map((f) => [f, urls.urlForAdditionalCodeUpload] as FileUpload),
                ])
            } catch (err: unknown) {
                const result = await onDeleteStudyAction({ studyId })
                if (isActionError(result)) {
                    logger.error(
                        `Failed to remove temp study details after upload failure: ${errorToString(result.error)}`,
                    )
                }
                throw err
            }
>>>>>>> 9e47cd72 (ensure tmp study is deleted if files fail to upload)
        },
        onSuccess() {
            notifications.show({
                title: 'Study Proposal Submitted',
                message:
                    'Your proposal has been successfully submitted to the reviewing organization. Check your dashboard for status updates.',
                color: 'green',
            })
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            router.push(`/researcher/dashboard`)
        },
        onError: async (error) => {
            notifications.show({
                color: 'red',
                title: 'Failed to create study',
                message: `${errorToString(error)}\nPlease contact support.`,
            })
        },
    })

    return (
        <form onSubmit={studyProposalForm.onSubmit((values) => createStudy(values))}>
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
                    <Button
                        type="button"
                        disabled={isPending}
                        variant="outline"
                        onClick={() => setStepIndex(stepIndex - 1)}
                    >
                        Back
                    </Button>
                )}

                <Group style={{ marginLeft: 'auto' }}>
                    <CancelButton disabled={isPending} isDirty={studyProposalForm.isDirty()} />
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
