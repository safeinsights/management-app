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
import { uploadFiles } from '@/hooks/upload'
import { isActionError } from '@/lib/errors'

type CodeEnv = ActionSuccessType<typeof createOrgCodeEnvAction>
type CreateFormValues = z.infer<typeof createOrgCodeEnvSchema>
type EditFormValues = z.infer<typeof editOrgCodeEnvSchema>
type CreateFormSchema = z.infer<typeof createOrgCodeEnvFormSchema>
type EditFormSchema = z.infer<typeof editOrgCodeEnvFormSchema>
type FormValues = CreateFormSchema | EditFormSchema

async function uploadStarterCode(orgSlug: string, codeEnvId: string, file: File) {
    const presignedUrl = await getStarterCodeUploadUrlAction({ orgSlug, codeEnvId })
    if (isActionError(presignedUrl)) throw new Error('Failed to get starter code upload URL')
    await uploadFiles([[file, presignedUrl]])
}

async function uploadSampleData(codeEnvId: string, files: File[]): Promise<boolean> {
    if (files.length === 0) return false
    const presignedUrl = await getSampleDataUploadUrlAction({ codeEnvId })
    if (isActionError(presignedUrl)) throw new Error('Failed to get sample data upload URL')
    await uploadFiles(files.map((file) => [file, presignedUrl]))
    return true
}

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

    const handleCreate = async (values: CreateFormValues) => {
        const { starterCode, ...rest } = values

        const result = await createOrgCodeEnvAction({
            orgSlug,
            ...rest,
            starterCodeFileName: starterCode.name,
        })
        if (isActionError(result)) return result

        await uploadStarterCode(orgSlug, result.id, starterCode)

        if (values.sampleDataPath) {
            await uploadSampleData(result.id, sampleDataFiles)
        }
        return result
    }

    const handleEdit = async (values: EditFormValues) => {
        const { starterCode, ...rest } = values
        const starterCodeUploaded = !!starterCode

        if (starterCode) {
            await uploadStarterCode(orgSlug, image!.id, starterCode)
        }

        const sampleDataUploaded = await uploadSampleData(image!.id, sampleDataFiles)

        return await updateOrgCodeEnvAction({
            orgSlug,
            imageId: image!.id,
            ...rest,
            starterCodeFileName: starterCode?.name,
            starterCodeUploaded,
            sampleDataUploaded,
        })
    }

    const { mutate: saveCodeEnv, isPending } = useMutation({
        mutationFn: async (values: CreateFormValues | EditFormValues) => {
            return isEditMode ? handleEdit(values as EditFormValues) : handleCreate(values as CreateFormValues)
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
