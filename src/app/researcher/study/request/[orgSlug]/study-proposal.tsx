'use client'

import React, { useState } from 'react'
import { Button, Group, Stepper } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { CancelButton } from '@/components/cancel-button'
import { useForm, UseFormReturnType } from '@mantine/form'
import {
    studyProposalFormSchema,
    codeFilesSchema,
    StudyProposalFormValues,
    StudyJobCodeFilesValues,
} from './study-proposal-form-schema'
import { StudyProposalForm } from './study-proposal-form'
import { StudyCodeUpload } from '@/components/study-code-upload'
import { onCreateStudyAction, onDeleteStudyAction } from './actions'
import { useRouter } from 'next/navigation'
import { zodResolver, useMutation, useQueryClient } from '@/common'
import { actionResult } from '@/lib/utils'
import { omit } from 'remeda'
import logger from '@/lib/logger'
import { errorToString, isActionError } from '@/lib/errors'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import ProxyProvider from '@/components/proxy-provider'

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const studyUploadForm: UseFormReturnType<StudyJobCodeFilesValues> = studyProposalForm as any
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

            try {
                await uploadFiles([
                    [formValues.irbDocument, urls.urlForIrbUpload],
                    [formValues.agreementDocument, urls.urlForAgreementUpload],
                    [formValues.descriptionDocument, urls.urlForAgreementUpload],
                    [formValues.mainCodeFile, urls.urlForCodeUpload],
                    ...formValues.additionalCodeFiles.map((f) => [f, urls.urlForCodeUpload] as FileUpload),
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
        },
        onSuccess() {
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            notifications.show({
                title: 'Study Proposal Submitted',
                message:
                    'Your proposal has been successfully submitted to the reviewing organization. Check your dashboard for status updates.',
                color: 'green',
            })
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
        <ProxyProvider isDirty={studyProposalForm.isDirty()}>
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
                        <StudyCodeUpload studyProposalForm={studyUploadForm} showStepIndicator={true} />
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
        </ProxyProvider>
    )
}
