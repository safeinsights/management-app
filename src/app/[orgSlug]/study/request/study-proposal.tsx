'use client'

import { useMutation, useQuery, useQueryClient, zodResolver } from '@/common'
import ProxyProvider from '@/components/proxy-provider'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { errorToString, isActionError } from '@/lib/errors'
import logger from '@/lib/logger'
import { getLabSlug } from '@/lib/org'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { Button, Group } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useParams, useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import { omit } from 'remeda'
import {
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
// Note: code files are handled separately in the upload step
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

    const { isPending: isSavingDraft, mutate: saveDraft } = useMutation({
        mutationFn: async ({
            formValues,
            navigateToUpload = false,
        }: {
            formValues: Partial<StudyProposalFormValues>
            navigateToUpload?: boolean
        }) => {
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

            return { studyId: result.studyId, navigateToUpload }
        },
        onSuccess({ studyId, navigateToUpload }) {
            setSessionStudyId(studyId)
            // Invalidate all related query caches so fresh data is fetched
            queryClient.invalidateQueries({ queryKey: ['draft-study', studyId] })
            // Also invalidate dashboard queries so the list reflects the updated draft
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] })

            if (navigateToUpload) {
                // Navigate to upload page
                router.push(Routes.studyUpload({ orgSlug: submittingOrgSlug, studyId }))
            } else {
                // Update URL to edit route if this was a new draft (not already on edit page)
                // Use history.replaceState to avoid component remount while still updating the URL
                if (!propStudyId) {
                    window.history.replaceState(null, '', Routes.studyEdit({ orgSlug: submittingOrgSlug, studyId }))
                }
                studyProposalForm.resetDirty()
                notifications.show({
                    title: 'Draft Saved',
                    message: 'Your study proposal has been saved as a draft.',
                    color: 'green',
                })
            }
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

    // Existing files from draft for display
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

    // Check if form is valid for proceeding
    const formValues = studyProposalForm.getValues()
    const hasDescription = !!formValues.descriptionDocument || !!existingFiles?.descriptionDocPath
    const hasIrb = !!formValues.irbDocument || !!existingFiles?.irbDocPath
    const hasAgreement = !!formValues.agreementDocument || !!existingFiles?.agreementDocPath
    const isFormValid =
        !!formValues.orgSlug &&
        !!formValues.language &&
        !!formValues.title &&
        formValues.title.length >= 5 &&
        hasDescription &&
        hasIrb &&
        hasAgreement

    return (
        <ProxyProvider
            isDirty={studyProposalForm.isDirty()}
            onSaveDraft={async () => {
                await new Promise<void>((resolve, reject) => {
                    saveDraft(
                        { formValues: studyProposalForm.getValues() },
                        {
                            onSuccess: () => resolve(),
                            onError: (error) => reject(error),
                        },
                    )
                })
            }}
            isSavingDraft={isSavingDraft}
        >
            <form onSubmit={studyProposalForm.onSubmit((values: StudyProposalFormValues) => createStudy(values))}>
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

                <Group mt="xxl" style={{ width: '100%' }}>
                    <Group style={{ marginLeft: 'auto' }}>
                        <Button
                            type="button"
                            variant="outline"
                            size="md"
                            disabled={!studyProposalForm.isDirty() || isPending}
                            loading={isSavingDraft}
                            onClick={() => saveDraft({ formValues: studyProposalForm.getValues() })}
                        >
                            Save as draft
                        </Button>
                        <Button
                            type="button"
                            size="md"
                            variant="primary"
                            disabled={!isFormValid || isPending}
                            loading={isSavingDraft}
                            onClick={() =>
                                saveDraft({ formValues: studyProposalForm.getValues(), navigateToUpload: true })
                            }
                        >
                            Save and proceed to upload
                        </Button>
                    </Group>
                </Group>
            </form>
        </ProxyProvider>
    )
}
