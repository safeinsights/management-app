'use client'

import { useState } from 'react'
import { useForm, useMutation, z, zodResolver } from '@/common'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { useParams } from 'next/navigation'
import {
    createOrgCodeEnvAction,
    updateOrgCodeEnvAction,
    getSampleDataUploadUrlAction,
    getStarterCodeUploadUrlAction,
} from './code-envs.actions'
import {
    createOrgCodeEnvSchema,
    editOrgCodeEnvSchema,
    createOrgCodeEnvFormSchema,
    editOrgCodeEnvFormSchema,
} from './code-envs.schema'
import { ActionSuccessType, type SampleDataFormat } from '@/lib/types'
import { Language } from '@/database/types'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { isActionError } from '@/lib/errors'

type CodeEnv = ActionSuccessType<typeof createOrgCodeEnvAction>
type CreateFormValues = z.infer<typeof createOrgCodeEnvSchema>
type EditFormValues = z.infer<typeof editOrgCodeEnvSchema>
type CreateFormSchema = z.infer<typeof createOrgCodeEnvFormSchema>
type EditFormSchema = z.infer<typeof editOrgCodeEnvFormSchema>
type FormValues = CreateFormSchema | EditFormSchema

export function useCodeEnvForm(image: CodeEnv | undefined, onCompleteAction: () => void) {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const isEditMode = !!image
    const [sampleDataFiles, setSampleDataFiles] = useState<File[]>([])

    const formSchema = isEditMode ? editOrgCodeEnvFormSchema : createOrgCodeEnvFormSchema

    const form = useForm<FormValues>({
        initialValues: {
            name: image?.name || '',
            cmdLine: image?.cmdLine || '',
            language: (image?.language || 'R') as Language,
            url: image?.url || '',
            isTesting: image?.isTesting || false,
            starterCode: undefined,
            sampleDataPath: image?.sampleDataPath || '',
            sampleDataFormat: (image?.sampleDataFormat as SampleDataFormat | null) || null,
            settings: {
                environment: image?.settings?.environment || [],
            },
            newEnvKey: '',
            newEnvValue: '',
        },
        validate: zodResolver(formSchema),
    })

    const addEnvVar = () => {
        if (!form.values.newEnvKey || !form.values.newEnvValue) return

        form.setValues({
            ...form.values,
            settings: {
                ...form.values.settings,
                environment: [
                    ...form.values.settings.environment,
                    { name: form.values.newEnvKey, value: form.values.newEnvValue },
                ],
            },
            newEnvKey: '',
            newEnvValue: '',
        })
    }

    const updateEnvVarName = (index: number, name: string) => {
        const updated = [...form.values.settings.environment]
        updated[index] = { ...updated[index], name }
        form.setFieldValue('settings.environment', updated)
    }

    const updateEnvVarValue = (index: number, value: string) => {
        const updated = [...form.values.settings.environment]
        updated[index] = { ...updated[index], value }
        form.setFieldValue('settings.environment', updated)
    }

    const removeEnvVar = (index: number) => {
        form.setFieldValue(
            'settings.environment',
            form.values.settings.environment.filter((_, i) => i !== index),
        )
    }

    const uploadSampleData = async (codeEnvId: string): Promise<boolean> => {
        if (sampleDataFiles.length === 0) return false

        const uploadUrlResult = await getSampleDataUploadUrlAction({ orgSlug, codeEnvId })
        if (isActionError(uploadUrlResult)) {
            throw new Error('Failed to get sample data upload URL')
        }

        const fileUploads: FileUpload[] = sampleDataFiles.map((file) => [file, uploadUrlResult])
        await uploadFiles(fileUploads)
        return true
    }

    const uploadStarterCode = async (codeEnvId: string, file: File) => {
        const uploadUrlResult = await getStarterCodeUploadUrlAction({ orgSlug, codeEnvId })
        if (isActionError(uploadUrlResult)) {
            throw new Error('Failed to get starter code upload URL')
        }

        await uploadFiles([[file, uploadUrlResult]])
    }

    const { mutate: saveCodeEnv, isPending } = useMutation({
        mutationFn: async (values: CreateFormValues | EditFormValues) => {
            if (isEditMode) {
                const { starterCode, ...rest } = values as EditFormValues
                const starterCodeFileName = starterCode?.name
                let starterCodeUploaded = false

                if (starterCode) {
                    await uploadStarterCode(image.id, starterCode)
                    starterCodeUploaded = true
                }

                const sampleDataUploaded = await uploadSampleData(image.id)

                return await updateOrgCodeEnvAction({
                    orgSlug,
                    imageId: image.id,
                    ...rest,
                    starterCodeFileName,
                    starterCodeUploaded,
                    sampleDataUploaded,
                })
            }

            const { starterCode, ...rest } = values as CreateFormValues

            const result = await createOrgCodeEnvAction({
                orgSlug,
                ...rest,
                starterCodeFileName: starterCode.name,
            })
            if (isActionError(result)) return result

            await uploadStarterCode(result.id, starterCode)

            if (sampleDataFiles.length > 0 && values.sampleDataPath) {
                const sampleDataUploaded = await uploadSampleData(result.id)
                return await updateOrgCodeEnvAction({
                    orgSlug,
                    imageId: result.id,
                    ...rest,
                    sampleDataUploaded,
                })
            }
            return result
        },
        onSuccess: () => {
            reportSuccess(isEditMode ? 'Code environment updated successfully' : 'Code environment added successfully')
            onCompleteAction()
        },
        onError: reportMutationError(
            isEditMode ? 'Failed to update code environment' : 'Failed to add code environment',
        ),
    })

    const onSubmit = form.onSubmit(({ newEnvKey, newEnvValue, ...values }) => {
        if (newEnvKey && newEnvValue) {
            values.settings = {
                ...values.settings,
                environment: [...values.settings.environment, { name: newEnvKey, value: newEnvValue }],
            }
        }
        saveCodeEnv(values as CreateFormValues | EditFormValues)
    })

    return {
        form,
        isEditMode,
        isPending,
        onSubmit,
        sampleDataFiles,
        setSampleDataFiles,
        envVarActions: { addEnvVar, updateEnvVarName, updateEnvVarValue, removeEnvVar },
    }
}
