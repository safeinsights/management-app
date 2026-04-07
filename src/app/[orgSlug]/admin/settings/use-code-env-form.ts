'use client'

import { useState } from 'react'
import { useForm, useMutation, z, zodResolver } from '@/common'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { useParams } from 'next/navigation'
import {
    createOrgCodeEnvAction,
    updateOrgCodeEnvAction,
    fetchOrgCodeEnvsAction,
    getSampleDataUploadUrlAction,
    getStarterCodeUploadUrlAction,
    createAthenaTablesAction,
} from './code-envs.actions'
import {
    createOrgCodeEnvSchema,
    editOrgCodeEnvSchema,
    createOrgCodeEnvFormSchema,
    editOrgCodeEnvFormSchema,
} from './code-envs.schema'
import { ActionSuccessType, type DataSourceType } from '@/lib/types'
import { Language } from '@/database/types'
import { uploadFiles } from '@/hooks/upload'
import { isActionError } from '@/lib/errors'

type CodeEnv = ActionSuccessType<typeof fetchOrgCodeEnvsAction>[number]
type CreateFormValues = z.infer<typeof createOrgCodeEnvSchema>
type EditFormValues = z.infer<typeof editOrgCodeEnvSchema>
type CreateFormSchema = z.infer<typeof createOrgCodeEnvFormSchema>
type EditFormSchema = z.infer<typeof editOrgCodeEnvFormSchema>
type FormValues = CreateFormSchema | EditFormSchema

async function uploadStarterCodes(orgSlug: string, codeEnvId: string, files: File[]) {
    if (files.length === 0) return
    const presignedUrl = await getStarterCodeUploadUrlAction({ orgSlug, codeEnvId })
    if (isActionError(presignedUrl)) throw new Error('Failed to get starter code upload URL')
    await uploadFiles(files.map((file) => [file, presignedUrl]))
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
            identifier: image?.identifier || '',
            commandLines: image?.commandLines ?? {},
            language: (image?.language || 'R') as Language,
            url: image?.url || '',
            isTesting: image?.isTesting || false,
            starterCodes: undefined,
            sampleDataPath: image?.sampleDataPath || '',
            dataSourceType: (image?.dataSourceType as DataSourceType | null) || null,
            dataSourceIds: image?.dataSources?.map((ds) => ds.id) || [],
            settings: {
                environment: image?.settings?.environment || [],
            },
            newEnvKey: '',
            newEnvValue: '',
            newCmdExt: '',
            newCmdValue: '',
            existingStarterCodeFileNames: image?.starterCodeFileNames ?? [],
        },
        validate: zodResolver(formSchema),
    })

    const setStarterCodes = (files: File[]) => {
        form.setFieldValue('starterCodes', files)
    }

    const removeStarterCode = (fileName: string) => {
        const current = (form.values.starterCodes as File[] | undefined) || []
        setStarterCodes(current.filter((f) => f.name !== fileName))
    }

    const addCommandLine = (ext: string, cmd: string) => {
        if (!ext || !cmd) return
        form.setFieldValue('commandLines', { ...form.values.commandLines, [ext]: cmd })
        form.setFieldValue('newCmdExt', '')
        form.setFieldValue('newCmdValue', '')
    }

    const updateCommandLine = (ext: string, cmd: string) => {
        form.setFieldValue('commandLines', { ...form.values.commandLines, [ext]: cmd })
    }

    const removeCommandLine = (ext: string) => {
        const { [ext]: _, ...rest } = form.values.commandLines
        form.setFieldValue('commandLines', rest)
    }

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
        const { starterCodes, ...rest } = values

        const result = await createOrgCodeEnvAction({
            orgSlug,
            ...rest,
            starterCodeFileNames: starterCodes.map((f) => f.name),
        })
        if (isActionError(result)) throw result

        await uploadStarterCodes(orgSlug, result.id, starterCodes)

        if (values.sampleDataPath) {
            await uploadSampleData(result.id, sampleDataFiles)
            if (values.dataSourceType === 'athena') {
                await createAthenaTablesAction({ codeEnvId: result.id })
            }
        }
        return result
    }

    const handleEdit = async (values: EditFormValues) => {
        const { starterCodes, ...rest } = values
        const starterCodeUploaded = !!starterCodes?.length

        const sampleDataUploaded = await uploadSampleData(image!.id, sampleDataFiles)

        const result = await updateOrgCodeEnvAction({
            orgSlug,
            codeEnvId: image!.id,
            ...rest,
            starterCodeFileNames: starterCodes?.map((f) => f.name),
            starterCodeUploaded,
            sampleDataUploaded,
        })
        if (isActionError(result)) throw result

        if (sampleDataUploaded && result.dataSourceType === 'athena') {
            await createAthenaTablesAction({ codeEnvId: image!.id })
        }

        if (starterCodes?.length) {
            await uploadStarterCodes(orgSlug, image!.id, starterCodes)
        }

        return result
    }

    const { mutate: saveCodeEnv, isPending } = useMutation({
        mutationFn: async (values: CreateFormValues | EditFormValues) => {
            return isEditMode ? handleEdit(values as EditFormValues) : handleCreate(values as CreateFormValues)
        },
        onSuccess: () => {
            reportSuccess(isEditMode ? 'Code environment updated successfully' : 'Code environment added successfully')
            onCompleteAction()
        },
        onError: (err: unknown) => {
            reportMutationError(isEditMode ? 'Failed to update code environment' : 'Failed to add code environment')(
                err,
            )
        },
    })

    const onSubmit = form.onSubmit(
        ({ newEnvKey, newEnvValue, newCmdExt, newCmdValue, existingStarterCodeFileNames: _, ...values }) => {
            if (newEnvKey && newEnvValue) {
                values.settings = {
                    ...values.settings,
                    environment: [...values.settings.environment, { name: newEnvKey, value: newEnvValue }],
                }
            }
            if (newCmdExt && newCmdValue) {
                values.commandLines = { ...values.commandLines, [newCmdExt]: newCmdValue }
            }
            saveCodeEnv(values as CreateFormValues | EditFormValues)
        },
    )

    return {
        form,
        isEditMode,
        isPending,
        onSubmit,
        sampleDataFiles,
        setSampleDataFiles,
        starterCodeActions: { setStarterCodes, removeStarterCode },
        commandLineActions: { addCommandLine, updateCommandLine, removeCommandLine },
        envVarActions: { addEnvVar, updateEnvVarName, updateEnvVarValue, removeEnvVar },
    }
}
