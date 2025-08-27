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
import { CodeReviewManifest } from '@/lib/code-manifest'
import { actionResult } from '@/lib/utils'
import { PresignedPost } from '@aws-sdk/s3-presigned-post'
import { omit } from 'remeda'
<<<<<<< HEAD
import { useUploadFile } from '@/hooks/upload'
=======
import logger from '@/lib/logger'
>>>>>>> 61bb8359 (upload using XMLHttpRequest)

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
    return new Promise<File>((resolve, reject) => {
        const body = new FormData()
        // fetch would occasionally cause a 'net::ERR_H2_OR_QUIC_REQUIRED' error
        // comment on https://github.com/aws/aws-sdk-js-v3/issues/6504 suggested using good old XMLHttpRequest
        const xhr = new XMLHttpRequest()
        xhr.open('POST', upload.url)

        // Do not set content-type, per https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects
        // Doing so will prevent the browser from being able to set the Content-Type header with the boundary expression
        // it will use to delimit form fields in the request body.
        // BAD: xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded")

        for (const [key, value] of Object.entries(upload.fields)) {
            body.append(key, value)
        }

        body.append('file', file)

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100
                logger.info(`Upload progress: ${percentComplete.toFixed(2)}%`)
            }
        }

        xhr.onload = () => {
            // will likely be a 204
            if (xhr.status > 200 && xhr.status < 300) {
                resolve(file)
            } else {
                const msg = `Upload failed with status ${xhr.status}: ${xhr.responseText}`
                logger.error(msg)
                reject(new Error(msg))
            }
        }

        xhr.onerror = () => {
            reject(new Error('XHR request failed with unknown status'))
        }

        xhr.send(body)
    })
}

async function uploadCodeFiles(uploads: Promise<File>[], files: File[], upload: PresignedPost, studyJobId: string) {
    const manifest = new CodeReviewManifest(studyJobId, 'r')
    for (const codeFile of files) {
        manifest.files.push(codeFile)
        uploads.push(uploadFile(codeFile, upload))
    }

    const manifestFile = new File([manifest.asJSON], 'manifest.json', { type: 'application/json' })
    uploads.push(uploadFile(manifestFile, upload))
    return uploads
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
            } = actionResult(
                await onCreateStudyAction({
                    orgSlug,
                    studyInfo: valuesWithFilenames,
                    mainCodeFileName: formValues.mainCodeFile!.name,
                    codeFileNames: formValues.additionalCodeFiles.map((file) => file.name),
                }),
            )
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
