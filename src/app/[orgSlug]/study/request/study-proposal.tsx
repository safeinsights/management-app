'use client'

import { useMutation, useQuery, useQueryClient, zodResolver } from '@/common'
import ProxyProvider from '@/components/proxy-provider'
import { StudyCodeUpload } from '@/components/study-code-upload'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { errorToString, isActionError } from '@/lib/errors'
import logger from '@/lib/logger'
import { getLabSlug } from '@/lib/org'
import { actionResult } from '@/lib/utils'
import { Button, Group, Stepper } from '@mantine/core'
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

    console.warn('[Draft Debug] urlStudyId:', urlStudyId)
    console.warn('[Draft Debug] sessionStudyId:', sessionStudyId)
    console.warn('[Draft Debug] draftStudyId:', draftStudyId)

    // Fetch draft data if studyId is in URL
    const {
        data: draftData,
        isLoading,
        error,
    } = useQuery({
        queryKey: ['draft-study', urlStudyId],
        queryFn: async () => {
            console.warn('[Draft Debug] Fetching draft data for studyId:', urlStudyId)
            const result = await getDraftStudyAction({ studyId: urlStudyId! })
            console.warn('[Draft Debug] getDraftStudyAction result:', result)
            return result
        },
        enabled: !!urlStudyId,
    })

    console.warn('[Draft Debug] draftData:', draftData)
    console.warn('[Draft Debug] isLoading:', isLoading)
    console.warn('[Draft Debug] error:', error)

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
        console.warn('[Draft Debug] useEffect triggered, draftData:', draftData)
        console.warn('[Draft Debug] draftData has title?', draftData && 'title' in draftData)

        if (draftData && 'title' in draftData) {
            console.warn('[Draft Debug] Setting form values:', {
                title: draftData.title,
                piName: draftData.piName,
                orgSlug: draftData.orgSlug,
            })
            studyProposalForm.setValues({
                title: draftData.title || '',
                piName: draftData.piName || '',
                orgSlug: draftData.orgSlug || '',
                // Note: Files cannot be restored from paths - user will need to re-upload
                irbDocument: null,
                descriptionDocument: null,
                agreementDocument: null,
                mainCodeFile: null,
                additionalCodeFiles: [],
            })
            studyProposalForm.resetDirty()
            console.warn('[Draft Debug] Form values after setValues:', studyProposalForm.getValues())
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
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!studyProposalForm.isDirty() || isPending || isSavingDraft}
                            loading={isSavingDraft}
                            onClick={() => saveDraft(studyProposalForm.getValues())}
                        >
                            Save as draft
                        </Button>
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
