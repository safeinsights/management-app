'use client'

import { useMutation, useQuery, useQueryClient, zodResolver } from '@/common'
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
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import React, { useState, useEffect } from 'react'
import { omit } from 'remeda'
import {
    getDraftStudyAction,
    onCreateStudyAction,
    onDeleteStudyAction,
    onSaveDraftStudyAction,
    onUpdateDraftStudyAction,
} from './actions'
import { StudyProposalForm } from './study-proposal-form'
import {
    codeFilesSchema,
    StudyJobCodeFilesValues,
    studyProposalFormSchema,
    StudyProposalFormValues,
} from './study-proposal-form-schema'
import { Routes } from '@/lib/routes'

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
}

const StepperButtons: React.FC<StepperButtonsProps> = ({ form, stepIndex, isPending, setStepIndex, existingFiles }) => {
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

    // Step 1 validity: check for code files (new File objects OR existing files from draft)
    const isStep1Valid = () => {
        const hasMainCodeFile = !!formValues.mainCodeFile || !!existingFiles?.mainCodeFileName
        return hasMainCodeFile
    }

    const isValid = stepIndex === 0 ? isStep0Valid() : isStep1Valid()

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
                Save and proceed to step 4
            </Button>
        )
    }

    if (stepIndex == 1) {
        return (
            <Button disabled={!isValid || isPending} type="submit" variant="primary" size="md">
                Save and proceed to review
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
function formValuesToDraftInfo(formValues: Partial<StudyProposalFormValues>) {
    return {
        title: formValues.title || undefined,
        piName: formValues.piName || undefined,
        language: formValues.language || undefined,
        descriptionDocPath: formValues.descriptionDocument?.name,
        agreementDocPath: formValues.agreementDocument?.name,
        irbDocPath: formValues.irbDocument?.name,
        mainCodeFilePath: formValues.mainCodeFile?.name,
        additionalCodeFilePaths: formValues.additionalCodeFiles?.map((file) => file.name),
    }
}

export const StudyProposal: React.FC = () => {
    const [stepIndex, setStepIndex] = useState(0)
    const searchParams = useSearchParams()
    const router = useRouter()

    // Read studyId from URL (for reopening drafts) or use state (for same-session updates)
    const urlStudyId = searchParams.get('studyId')
    const [sessionStudyId, setSessionStudyId] = useState<string | null>(null)
    const draftStudyId = urlStudyId || sessionStudyId

    // Fetch draft data if studyId is in URL
    const { data: draftData } = useQuery({
        queryKey: ['draft-study', urlStudyId],
        queryFn: () => getDraftStudyAction({ studyId: urlStudyId! }),
        enabled: !!urlStudyId,
    })

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
    const { orgSlug: submittingOrgSlug } = useParams<{ orgSlug: string }>()

    const { isPending, mutate: createStudy } = useMutation({
        mutationFn: async (formValues: StudyProposalFormValues) => {
            const { studyId, studyJobId, ...urls } = actionResult(
                await onCreateStudyAction({
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
        },
        onSuccess() {
            // Invalidate both org-specific and user-level study queries
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
                        mainCodeFileName: formValues.mainCodeFile?.name,
                        codeFileNames: formValues.additionalCodeFiles?.map((f) => f.name),
                    }),
                )
            } else {
                // Create new draft
                result = actionResult(
                    await onSaveDraftStudyAction({
                        orgSlug: formValues.orgSlug || '',
                        studyInfo: draftInfo,
                        submittingOrgSlug: getLabSlug(submittingOrgSlug),
                        mainCodeFileName: formValues.mainCodeFile?.name,
                        codeFileNames: formValues.additionalCodeFiles?.map((f) => f.name),
                    }),
                )
            }

            // Upload files that exist
            if (formValues.irbDocument && result.urlForIrbUpload) {
                filesToUpload.push([formValues.irbDocument, result.urlForIrbUpload])
            }
            if (formValues.agreementDocument && result.urlForAgreementUpload) {
                filesToUpload.push([formValues.agreementDocument, result.urlForAgreementUpload])
            }
            if (formValues.descriptionDocument && result.urlForDescriptionUpload) {
                filesToUpload.push([formValues.descriptionDocument, result.urlForDescriptionUpload])
            }
            if (formValues.mainCodeFile && result.urlForCodeUpload) {
                filesToUpload.push([formValues.mainCodeFile, result.urlForCodeUpload])
                formValues.additionalCodeFiles?.forEach((f) => {
                    filesToUpload.push([f, result.urlForCodeUpload!])
                })
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
            // Update URL with studyId so it persists on page refresh
            if (!urlStudyId) {
                const url = new URL(window.location.href)
                url.searchParams.set('studyId', studyId)
                router.replace((url.pathname + url.search) as Route)
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
                        />
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
                        />
                    </Group>
                </Group>
            </form>
        </ProxyProvider>
    )
}
