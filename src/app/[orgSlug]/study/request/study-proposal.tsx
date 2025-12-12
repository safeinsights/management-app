'use client'

import { useMutation, useQueryClient, zodResolver } from '@/common'
import { CancelButton } from '@/components/cancel-button'
import ProxyProvider from '@/components/proxy-provider'
import { StudyCodeUpload } from '@/components/study-code-upload'
import { Language } from '@/database/types'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { errorToString, isActionError } from '@/lib/errors'
import logger from '@/lib/logger'
import { getLabSlug } from '@/lib/org'
import { actionResult } from '@/lib/utils'
import { Button, Group, Stepper } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { useForm, UseFormReturnType } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useParams, useRouter } from 'next/navigation'
import React, { useState } from 'react'
import { omit } from 'remeda'
import { onCreateStudyAction, onCreateStudyDraftAction, onDeleteStudyAction } from './actions'
import { StudyProposalForm } from './study-proposal-form'
import {
    codeFilesSchema,
    StudyJobCodeFilesValues,
    studyProposalFormSchema,
    StudyProposalFormValues,
} from './study-proposal-form-schema'
import { Routes } from '@/lib/routes'

type StepperButtonsProps = {
    form: UseFormReturnType<StudyProposalFormValues>
    stepIndex: number
    isPending: boolean
    setStepIndex: (i: number) => void
    createStudy: (variables: { formValues: StudyProposalFormValues; isDraft: boolean }) => void
}

const StepperButtons: React.FC<StepperButtonsProps> = ({ form, stepIndex, isPending, setStepIndex, createStudy }) => {
    const isValid = form.isValid()

    if (stepIndex == 0) {
        return (
            <Button
                type="button"
                size="md"
                variant="primary"
                disabled={!isValid || isPending}
                onClick={(e) => {
                    e.preventDefault()
                    setStepIndex(stepIndex + 1)
                }}
            >
                Save and proceed to step 2
            </Button>
        )
    }

    if (stepIndex == 1) {
        return (
            <>
                <Button
                    variant="outline"
                    onClick={() => createStudy({ formValues: form.values, isDraft: true })}
                    disabled={!isValid || isPending}
                    loading={isPending}
                >
                    Save as draft
                </Button>
                <Button type="submit" variant="primary" size="md" disabled={!isValid || isPending} loading={isPending}>
                    Submit
                </Button>
            </>
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
            'orgSlug',
            'language',
        ]),
        language: formValues.language as 'R' | 'PYTHON',
        descriptionDocPath: formValues.descriptionDocument!.name,
        agreementDocPath: formValues.agreementDocument!.name,
        irbDocPath: formValues.irbDocument!.name,
        mainCodeFilePath: formValues.mainCodeFile!.name,
        additionalCodeFilePaths: formValues.additionalCodeFiles.map((file) => file.name),
    }
}

export const StudyProposal: React.FC = () => {
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
            orgSlug: '',
            language: null,
        },
        validateInputOnChange: [
            'title',
            'orgSlug',
            'language',
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
    const { orgSlug: submittingOrgSlug } = useParams<{ orgSlug: string }>()

    const { isPending, mutate: createStudy } = useMutation({
        mutationFn: async (variables: { formValues: StudyProposalFormValues; isDraft: boolean }) => {
            const { formValues, isDraft } = variables
            const action = isDraft ? onCreateStudyDraftAction : onCreateStudyAction
            const { studyId, studyJobId, ...urls } = actionResult(
                await action({
                    orgSlug: formValues.orgSlug,
                    studyInfo: formValuesToStudyInfo(formValues),
                    mainCodeFileName: formValues.mainCodeFile!.name,
                    codeFileNames: formValues.additionalCodeFiles.map((file) => file.name),
                    submittingOrgSlug: getLabSlug(submittingOrgSlug),
                }),
            )
            try {
                await uploadFiles([
                    [formValues.irbDocument, urls.urlForIrbUpload],
                    [formValues.agreementDocument, urls.urlForAgreementUpload],
                    [formValues.descriptionDocument, urls.urlForDescriptionUpload],
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
            return { studyId, orgSlug: formValues.orgSlug, isDraft }
        },
        onSuccess({ isDraft }) {
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] })
            notifications.show({
                title: isDraft ? 'Study Proposal Draft Saved' : 'Study Proposal Submitted',
                message: isDraft
                    ? 'Your proposal has been saved as a draft.'
                    : 'Your proposal has been successfully submitted.',
                color: 'green',
            })
            router.push(Routes.dashboard)
        },
        onError: async (error) => {
            notifications.show({
                color: 'red',
                title: 'Failed to create study',
                message: `${errorToString(error)}
Please contact support.`,
            })
        },
    })

    return (
        <ProxyProvider isDirty={studyProposalForm.isDirty()}>
            <form
                onSubmit={studyProposalForm.onSubmit((values: StudyProposalFormValues) =>
                    createStudy({ formValues: values, isDraft: false }),
                )}
            >
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
                        <StudyCodeUpload
                            studyUploadForm={studyUploadForm}
                            showStepIndicator={true}
                            orgSlug={studyProposalForm.values.orgSlug}
                            language={studyProposalForm.values.language as Language}
                        />
                    </Stepper.Step>
                </Stepper>

                <Group mt="xxl" style={{ width: '100%' }}>
                    <Group style={{ marginLeft: 'auto' }}>
                        {stepIndex === 0 && <CancelButton disabled={isPending} isDirty={studyProposalForm.isDirty()} />}
                        {stepIndex === 1 && (
                            <Button
                                type="button"
                                size="md"
                                disabled={isPending}
                                variant="subtle"
                                onClick={() => setStepIndex(stepIndex - 1)}
                                leftSection={<CaretLeftIcon />}
                            >
                                Previous
                            </Button>
                        )}
                        <StepperButtons
                            form={studyProposalForm}
                            stepIndex={stepIndex}
                            isPending={isPending}
                            setStepIndex={setStepIndex}
                            createStudy={createStudy}
                        />
                    </Group>
                </Group>
            </form>
        </ProxyProvider>
    )
}
