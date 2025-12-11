'use client'

import { useMutation, useQuery, useQueryClient, zodResolver } from '@/common'
import ProxyProvider from '@/components/proxy-provider'
import { StudyCodeUpload } from '@/components/study-code-upload'
import { StudyCodeFromIDE } from '@/components/study/study-code-from-ide'
import { Language } from '@/database/types'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { errorToString, isActionError } from '@/lib/errors'
import logger from '@/lib/logger'
import { getLabSlug } from '@/lib/org'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { StudyJobCodeFilesValues } from '@/schema/study-proposal'
import { Button, Group, Stepper } from '@mantine/core'
import { useForm, UseFormReturnType } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { useParams, useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import { omit } from 'remeda'
import {
    submitStudyFromIDEAction,
    getDraftStudyAction,
    onCreateStudyAction,
    onDeleteStudyAction,
    onSaveDraftStudyAction,
    onUpdateDraftStudyAction,
} from './actions'
import { StudyProposalForm } from './study-proposal-form'
import { studyProposalFormSchema, StudyProposalFormValues } from './study-proposal-form-schema'

type ExistingDraftFiles = {
    descriptionDocPath?: string | null
    irbDocPath?: string | null
    agreementDocPath?: string | null
    mainCodeFileName?: string | null
    additionalCodeFileNames?: string[]
}

type StepperButtonsProps = {
    form: UseFormReturnType<StudyProposalFormValues>
    stepIndex: number
    isPending: boolean
    setStepIndex: (i: number) => void
    existingFiles?: ExistingDraftFiles
    onSubmitFromIDE: () => void
    ideLaunched: boolean
}

const StepperButtons: React.FC<StepperButtonsProps> = ({
    form,
    stepIndex,
    isPending,
    setStepIndex,
    existingFiles,
    onSubmitFromIDE,
    ideLaunched,
}) => {
    const formValues = form.getValues()

    // Step 0 validity: simple existence checks (accepts either new files OR existing files from draft)
    // drafts may have files in S3 but no File objects
    const isStep0Valid = () => {
        const hasDescription = !!formValues.descriptionDocument || !!existingFiles?.descriptionDocPath
        const hasIrb = !!formValues.irbDocument || !!existingFiles?.irbDocPath
        const hasAgreement = !!formValues.agreementDocument || !!existingFiles?.agreementDocPath

        return (
            !!formValues.orgSlug &&
            !!formValues.language &&
            !!formValues.title &&
            formValues.title.length >= 5 &&
            hasDescription &&
            hasIrb &&
            hasAgreement
        )
    }

    const isValid = stepIndex === 0 ? isStep0Valid() : form.isValid()

    if (stepIndex == 0) {
        return (
            <Button
                type="button"
                size="md"
                variant="primary"
                disabled={!isValid || isPending}
                onClick={(e) => {
                    e.preventDefault()
                    setStepIndex(1)
                }}
            >
                Save and proceed to step 4
            </Button>
        )
    }

    if (stepIndex == 1) {
        // If IDE was launched, go to step 2 (file selection) instead of submitting
        if (ideLaunched) {
            return (
                <Button
                    type="button"
                    variant="primary"
                    size="md"
                    disabled={isPending}
                    onClick={(e) => {
                        e.preventDefault()
                        setStepIndex(2)
                    }}
                >
                    Proceed to select files
                </Button>
            )
        }
        // Otherwise, submit the form with uploaded files
        return (
            <Button disabled={!isValid || isPending} type="submit" variant="primary" size="md">
                Save and proceed to review
            </Button>
        )
    }

    if (stepIndex == 2) {
        return (
            <Button
                type="button"
                variant="primary"
                disabled={isPending || !formValues.ideMainFile}
                onClick={onSubmitFromIDE}
                loading={isPending}
            >
                Submit Study
            </Button>
        )
    }
    return null
}

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

// Convert partial form values to draft study info (handles missing fields)
// Note: code files are handled separately in step 4, not during draft save
function formValuesToDraftInfo(formValues: Partial<StudyProposalFormValues>) {
    return {
        title: formValues.title || undefined,
        piName: formValues.piName || undefined,
        language: formValues.language || undefined,
        descriptionDocPath: formValues.descriptionDocument?.name,
        agreementDocPath: formValues.agreementDocument?.name,
        irbDocPath: formValues.irbDocument?.name,
    }
}

type StudyProposalProps = {
    studyId?: string // Optional studyId for editing existing drafts
}

export const StudyProposal: React.FC<StudyProposalProps> = ({ studyId: propStudyId }) => {
    const [stepIndex, setStepIndex] = useState(0)
    const [ideLaunched, setIdeLaunched] = useState(false)
    const router = useRouter()
    const { orgSlug: submittingOrgSlug } = useParams<{ orgSlug: string }>()

    // Use prop studyId (from edit page) or state (for same-session updates after first save)
    const [sessionStudyId, setSessionStudyId] = useState<string | null>(null)
    const draftStudyId = propStudyId || sessionStudyId

    // Fetch draft data if studyId exists
    const { data: draftData } = useQuery({
        queryKey: ['draft-study', draftStudyId],
        queryFn: () => getDraftStudyAction({ studyId: draftStudyId! }),
        enabled: !!draftStudyId,
    })

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
            orgSlug: '',
            language: null,
            stepIndex: 0,
            createdStudyId: null,
            ideMainFile: '',
            ideFiles: [],
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

    // Populate form with draft data when loaded
    useEffect(() => {
        if (draftData && 'title' in draftData) {
            studyProposalForm.setValues({
                title: draftData.title || '',
                piName: draftData.piName || '',
                language: draftData.language || null,
                orgSlug: draftData.orgSlug || '',
                // File inputs start empty - existing files are tracked via existingFiles prop
                irbDocument: null,
                descriptionDocument: null,
                agreementDocument: null,
                mainCodeFile: null,
                additionalCodeFiles: [],
            })
            studyProposalForm.resetDirty()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftData])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const studyUploadForm: UseFormReturnType<StudyJobCodeFilesValues> = studyProposalForm as any
    const queryClient = useQueryClient()

    const { isPending: isCreatingStudy, mutate: createStudy } = useMutation({
        mutationFn: async (formValues: StudyProposalFormValues) => {
            const { studyId, urlForCodeUpload, ...urls } = actionResult(
                await onCreateStudyAction({
                    orgSlug: formValues.orgSlug,
                    studyInfo: formValuesToStudyInfo(formValues),
                    mainCodeFileName: formValues.mainCodeFile!.name,
                    codeFileNames: formValues.additionalCodeFiles.map((f) => f.name),
                    submittingOrgSlug: getLabSlug(submittingOrgSlug),
                }),
            )
            try {
                await uploadFiles([
                    [formValues.mainCodeFile, urlForCodeUpload],
                    ...formValues.additionalCodeFiles.map((f): FileUpload => [f, urlForCodeUpload]),
                    [formValues.irbDocument, urls.urlForIrbUpload],
                    [formValues.agreementDocument, urls.urlForAgreementUpload],
                    [formValues.descriptionDocument, urls.urlForDescriptionUpload],
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
            return { studyId }
        },
        onSuccess() {
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] })
            notifications.show({
                title: 'Study Proposal Submitted',
                message:
                    'Your proposal has been successfully submitted to the reviewing organization. Check your dashboard for status updates.',
                color: 'green',
            })
            router.push(Routes.dashboard)
        },
        onError: async (error) => {
            notifications.show({
                color: 'red',
                title: 'Failed to create study',
                message: `${errorToString(error)}\nPlease contact support.`,
            })
        },
    })

    const { isPending: isSubmittingFromIDE, mutate: submitStudyFromIDE } = useMutation({
        mutationFn: async () => {
            const studyId = draftStudyId
            const { ideMainFile, ideFiles } = studyProposalForm.values
            if (!studyId || !ideMainFile || ideFiles.length === 0) {
                throw new Error('Study ID, main file, or files not set')
            }
            const result = await submitStudyFromIDEAction({
                studyId,
                mainFileName: ideMainFile,
                fileNames: ideFiles,
            })
            if ('error' in result) {
                throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
            }
            return result
        },
        onSuccess() {
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] })
            notifications.show({
                title: 'Study Proposal Submitted',
                message:
                    'Your proposal has been successfully submitted to the reviewing organization. Check your dashboard for status updates.',
                color: 'green',
            })
            router.push(Routes.dashboard)
        },
        onError: async (error) => {
            notifications.show({
                color: 'red',
                title: 'Failed to import files from IDE',
                message: `${errorToString(error)}\nPlease contact support.`,
            })
        },
    })

    const { isPending: isSavingDraft, mutate: saveDraft } = useMutation({
        mutationFn: async (formValues: Partial<StudyProposalFormValues>) => {
            const draftInfo = formValuesToDraftInfo(formValues)
            const filesToUpload: FileUpload[] = []

            let result
            if (draftStudyId) {
                // Update existing draft
                result = actionResult(
                    await onUpdateDraftStudyAction({
                        studyId: draftStudyId,
                        studyInfo: draftInfo,
                    }),
                )
            } else {
                // Create new draft
                result = actionResult(
                    await onSaveDraftStudyAction({
                        orgSlug: formValues.orgSlug || '',
                        studyInfo: draftInfo,
                        submittingOrgSlug: getLabSlug(submittingOrgSlug),
                    }),
                )
            }

            // Upload document files (code files are handled in step 4)
            if (formValues.irbDocument && result.urlForIrbUpload) {
                filesToUpload.push([formValues.irbDocument, result.urlForIrbUpload])
            }
            if (formValues.agreementDocument && result.urlForAgreementUpload) {
                filesToUpload.push([formValues.agreementDocument, result.urlForAgreementUpload])
            }
            if (formValues.descriptionDocument && result.urlForDescriptionUpload) {
                filesToUpload.push([formValues.descriptionDocument, result.urlForDescriptionUpload])
            }

            if (filesToUpload.length > 0) {
                await uploadFiles(filesToUpload)
            }

            return result.studyId
        },
        onSuccess(studyId) {
            setSessionStudyId(studyId)
            // Invalidate all related query caches so fresh data is fetched
            queryClient.invalidateQueries({ queryKey: ['draft-study', studyId] })
            // Also invalidate dashboard queries so the list reflects the updated draft
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] })
            // Navigate to edit route if this was a new draft (not already on edit page)
            if (!propStudyId) {
                router.replace(Routes.studyEdit({ orgSlug: submittingOrgSlug, studyId }))
            }
            studyProposalForm.resetDirty()
            notifications.show({
                title: 'Draft Saved',
                message: 'Your study proposal has been saved as a draft.',
                color: 'green',
            })
        },
        onError: async (error) => {
            notifications.show({
                color: 'red',
                title: 'Failed to save draft',
                message: `${errorToString(error)}\nPlease contact support.`,
            })
        },
    })

    const isPending = isCreatingStudy || isSavingDraft || isSubmittingFromIDE

    return (
        <ProxyProvider
            isDirty={studyProposalForm.isDirty()}
            onSaveDraft={async () => {
                await new Promise<void>((resolve, reject) => {
                    saveDraft(studyProposalForm.getValues(), {
                        onSuccess: () => resolve(),
                        onError: (error) => reject(error),
                    })
                })
            }}
            isSavingDraft={isSavingDraft}
        >
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
                        <StudyProposalForm
                            studyProposalForm={studyProposalForm}
                            existingFiles={
                                draftData && 'descriptionDocPath' in draftData
                                    ? {
                                          descriptionDocPath: draftData.descriptionDocPath,
                                          irbDocPath: draftData.irbDocPath,
                                          agreementDocPath: draftData.agreementDocPath,
                                      }
                                    : undefined
                            }
                        />
                    </Stepper.Step>

                    <Stepper.Step>
                        <StudyCodeUpload
                            studyUploadForm={studyUploadForm}
                            showStepIndicator={true}
                            orgSlug={studyProposalForm.values.orgSlug}
                            language={studyProposalForm.values.language as Language}
                            studyId={draftStudyId}
                            onBeforeLaunchIDE={async () => {
                                // Save draft first if needed, then return the studyId
                                if (draftStudyId) return draftStudyId
                                return new Promise<string | null>((resolve) => {
                                    saveDraft(studyProposalForm.getValues(), {
                                        onSuccess: (studyId) => resolve(studyId),
                                        onError: () => resolve(null),
                                    })
                                })
                            }}
                            onIDELaunched={() => setIdeLaunched(true)}
                        />
                    </Stepper.Step>

                    <Stepper.Step>
                        {draftStudyId && (
                            <StudyCodeFromIDE
                                studyId={draftStudyId}
                                onMainFileChange={(file) => studyProposalForm.setFieldValue('ideMainFile', file)}
                                onFilesChange={(files) => studyProposalForm.setFieldValue('ideFiles', files)}
                            />
                        )}
                    </Stepper.Step>
                </Stepper>

                <Group mt="xxl" style={{ width: '100%' }}>
                    <Group style={{ marginLeft: 'auto' }}>
                        {stepIndex === 0 && (
                            <Button
                                type="button"
                                variant="outline"
                                size="md"
                                disabled={!studyProposalForm.isDirty() || isPending || isSavingDraft}
                                loading={isSavingDraft}
                                onClick={() => saveDraft(studyProposalForm.getValues())}
                            >
                                Save as draft
                            </Button>
                        )}
                        {(stepIndex === 1 || stepIndex === 2) && (
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
                            existingFiles={
                                draftData && 'descriptionDocPath' in draftData
                                    ? {
                                          descriptionDocPath: draftData.descriptionDocPath,
                                          irbDocPath: draftData.irbDocPath,
                                          agreementDocPath: draftData.agreementDocPath,
                                          mainCodeFileName: draftData.mainCodeFileName,
                                          additionalCodeFileNames: draftData.additionalCodeFileNames,
                                      }
                                    : undefined
                            }
                            onSubmitFromIDE={() => submitStudyFromIDE()}
                            ideLaunched={ideLaunched}
                        />
                    </Group>
                </Group>
            </form>
        </ProxyProvider>
    )
}
