'use client'

import { useMutation, useQuery, useQueryClient, zodResolver } from '@/common'
import ProxyProvider from '@/components/proxy-provider'
import { StudyCodeUpload } from '@/components/study-code-upload'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { Language } from '@/database/types'
import { errorToString, isActionError } from '@/lib/errors'
import logger from '@/lib/logger'
import { getLabSlug } from '@/lib/org'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { Button, Group, Stepper } from '@mantine/core'
import { useForm, UseFormReturnType } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useParams, useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import { omit } from 'remeda'
import {
    getDraftStudyAction,
    onCreateStudyAction,
    onDeleteStudyAction,
    onSaveDraftStudyAction,
    onUpdateDraftStudyAction,
} from '@/server/actions/study-request'
import { StudyProposalForm } from './study-proposal-form'
import { StudyProposalReview } from './review-proposal'
import { codeFilesSchema, studyProposalFormSchema, StudyProposalFormValues } from './study-proposal-form-schema'

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
    isSavingDraft: boolean
    onSaveAndProceed: () => void
}

const StepperButtons: React.FC<StepperButtonsProps> = ({
    form,
    stepIndex,
    isPending,
    setStepIndex,
    existingFiles,
    isSavingDraft,
    onSaveAndProceed,
}) => {
    const formValues = form.getValues()

    // Step 0 validity: simple existence checks (accepts either new files OR existing files from draft)
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

    // Step 1 validity: must have a main code file selected
    const isStep1Valid = () => {
        return !!formValues.mainCodeFile
    }

    if (stepIndex === 0) {
        return (
            <Button
                type="button"
                size="md"
                variant="primary"
                disabled={!isStep0Valid() || isPending || isSavingDraft}
                loading={isSavingDraft}
                onClick={(e) => {
                    e.preventDefault()
                    onSaveAndProceed()
                }}
            >
                Save and proceed to Step 4
            </Button>
        )
    }

    if (stepIndex === 1) {
        return (
            <Button
                disabled={!isStep1Valid() || isPending}
                type="button"
                variant="primary"
                size="md"
                onClick={(e) => {
                    e.preventDefault()
                    setStepIndex(2)
                }}
            >
                Save and proceed to review
            </Button>
        )
    }

    if (stepIndex === 2) {
        return (
            <Button disabled={isPending} type="submit" variant="primary" size="md">
                Submit study
            </Button>
        )
    }
    return null
}

// Convert partial form values to draft study info (handles missing fields)
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
    const [codeUploadViewMode, setCodeUploadViewMode] = useState<'upload' | 'review'>('upload')
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
        validate: zodResolver(stepIndex === 0 ? studyProposalFormSchema : codeFilesSchema),
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

    const queryClient = useQueryClient()

    // Get existing file paths from draft data
    const existingFiles: ExistingDraftFiles | undefined =
        draftData && 'descriptionDocPath' in draftData
            ? {
                  descriptionDocPath: draftData.descriptionDocPath,
                  irbDocPath: draftData.irbDocPath,
                  agreementDocPath: draftData.agreementDocPath,
                  mainCodeFileName: draftData.mainCodeFileName,
                  additionalCodeFileNames: draftData.additionalCodeFileNames,
              }
            : undefined

    const { isPending: isCreatingStudy, mutate: createStudy } = useMutation({
        mutationFn: async (formValues: StudyProposalFormValues) => {
            // Use form file names if available, otherwise fall back to existing file paths from draft
            const descriptionDocPath = formValues.descriptionDocument?.name || existingFiles?.descriptionDocPath
            const agreementDocPath = formValues.agreementDocument?.name || existingFiles?.agreementDocPath
            const irbDocPath = formValues.irbDocument?.name || existingFiles?.irbDocPath
            const mainCodeFileName = formValues.mainCodeFile?.name || existingFiles?.mainCodeFileName
            const additionalCodeFileNames =
                formValues.additionalCodeFiles.length > 0
                    ? formValues.additionalCodeFiles.map((f) => f.name)
                    : existingFiles?.additionalCodeFileNames || []

            if (!descriptionDocPath || !agreementDocPath || !irbDocPath || !mainCodeFileName) {
                throw new Error('Missing required files. Please upload all required documents.')
            }

            const studyInfo = {
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
                descriptionDocPath,
                agreementDocPath,
                irbDocPath,
                mainCodeFilePath: mainCodeFileName,
                additionalCodeFilePaths: additionalCodeFileNames,
            }

            const { studyId, urlForCodeUpload, ...urls } = actionResult(
                await onCreateStudyAction({
                    orgSlug: formValues.orgSlug,
                    studyInfo,
                    mainCodeFileName,
                    codeFileNames: additionalCodeFileNames,
                    submittingOrgSlug: getLabSlug(submittingOrgSlug),
                }),
            )

            // Only upload files that exist as File objects (not already uploaded)
            const filesToUpload: FileUpload[] = []
            if (formValues.mainCodeFile) {
                filesToUpload.push([formValues.mainCodeFile, urlForCodeUpload])
            }
            formValues.additionalCodeFiles.forEach((f) => {
                filesToUpload.push([f, urlForCodeUpload])
            })
            if (formValues.irbDocument) {
                filesToUpload.push([formValues.irbDocument, urls.urlForIrbUpload])
            }
            if (formValues.agreementDocument) {
                filesToUpload.push([formValues.agreementDocument, urls.urlForAgreementUpload])
            }
            if (formValues.descriptionDocument) {
                filesToUpload.push([formValues.descriptionDocument, urls.urlForDescriptionUpload])
            }

            if (filesToUpload.length > 0) {
                try {
                    await uploadFiles(filesToUpload)
                } catch (err: unknown) {
                    const result = await onDeleteStudyAction({ studyId })
                    if (isActionError(result)) {
                        logger.error(
                            `Failed to remove temp study details after upload failure: ${errorToString(result.error)}`,
                        )
                    }
                    throw err
                }
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

            // Upload document files (code files are handled in the upload step)
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

            return { studyId: result.studyId }
        },
        onSuccess({ studyId }) {
            setSessionStudyId(studyId)
            // Invalidate all related query caches so fresh data is fetched
            queryClient.invalidateQueries({ queryKey: ['draft-study', studyId] })
            // Also invalidate dashboard queries so the list reflects the updated draft
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] })

            // Update URL to edit route if this was a new draft (not already on edit page)
            if (!propStudyId) {
                window.history.replaceState(null, '', Routes.studyEdit({ orgSlug: submittingOrgSlug, studyId }))
            }
            studyProposalForm.resetDirty()
        },
        onError: async (error) => {
            notifications.show({
                color: 'red',
                title: 'Failed to save draft',
                message: `${errorToString(error)}\nPlease contact support.`,
            })
        },
    })

    const isPending = isCreatingStudy || isSavingDraft

    const onSaveAndProceed = () => {
        saveDraft(studyProposalForm.getValues(), {
            onSuccess: () => setStepIndex(1),
        })
    }

    const handleSaveDraftOnly = () => {
        saveDraft(studyProposalForm.getValues(), {
            onSuccess: () => {
                notifications.show({
                    title: 'Draft Saved',
                    message: 'Your study proposal has been saved as a draft.',
                    color: 'green',
                })
            },
        })
    }

    // Handle when files are uploaded and user proceeds from ReviewUploadedFiles
    const handleCodeUploadProceed = () => {
        // The form should already have mainCodeFile and additionalCodeFiles set
        // from StudyCodeUpload component, so we just move to step 2
        setStepIndex(2)
    }

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
                                existingFiles
                                    ? {
                                          descriptionDocPath: existingFiles.descriptionDocPath,
                                          irbDocPath: existingFiles.irbDocPath,
                                          agreementDocPath: existingFiles.agreementDocPath,
                                      }
                                    : undefined
                            }
                        />
                    </Stepper.Step>

                    <Stepper.Step>
                        <StudyCodeUpload
                            studyUploadForm={studyProposalForm}
                            stepIndicator="Step 4 of 5"
                            orgSlug={studyProposalForm.getValues().orgSlug}
                            language={studyProposalForm.getValues().language as Language}
                            studyId={draftStudyId || ''}
                            viewMode={codeUploadViewMode}
                            onViewModeChange={setCodeUploadViewMode}
                            onProceed={handleCodeUploadProceed}
                        />
                    </Stepper.Step>

                    <Stepper.Step>
                        <StudyProposalReview
                            form={studyProposalForm}
                            studyId={draftStudyId || ''}
                            existingFiles={existingFiles}
                        />
                    </Stepper.Step>
                </Stepper>

                <Group mt="xxl" style={{ width: '100%' }}>
                    <Group style={{ marginLeft: 'auto' }}>
                        {(stepIndex === 0 || stepIndex === 2) && (
                            <Button
                                type="button"
                                variant="outline"
                                size="md"
                                disabled={!studyProposalForm.isDirty() || isPending}
                                loading={isSavingDraft}
                                onClick={handleSaveDraftOnly}
                            >
                                Save as draft
                            </Button>
                        )}
                        {stepIndex === 1 && codeUploadViewMode === 'upload' && (
                            <Button
                                type="button"
                                size="md"
                                disabled={isPending}
                                variant="subtle"
                                onClick={() => setStepIndex(0)}
                                leftSection={<CaretLeftIcon />}
                            >
                                Previous
                            </Button>
                        )}
                        {stepIndex === 2 && (
                            <Button
                                type="button"
                                size="md"
                                disabled={isPending}
                                variant="subtle"
                                onClick={() => setStepIndex(1)}
                                leftSection={<CaretLeftIcon />}
                            >
                                Previous
                            </Button>
                        )}
                        {/* Only show stepper buttons when not in review mode on step 1 */}
                        {!(stepIndex === 1 && codeUploadViewMode === 'review') && (
                            <StepperButtons
                                form={studyProposalForm}
                                stepIndex={stepIndex}
                                isPending={isPending}
                                setStepIndex={setStepIndex}
                                existingFiles={existingFiles}
                                isSavingDraft={isSavingDraft}
                                onSaveAndProceed={onSaveAndProceed}
                            />
                        )}
                    </Group>
                </Group>
            </form>
        </ProxyProvider>
    )
}
