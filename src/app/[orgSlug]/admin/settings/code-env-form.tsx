'use client'

import { useForm, useMutation, z, zodResolver } from '@/common'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { Button, Checkbox, FileInput, Select, Stack, TextInput, Text, Group, ActionIcon, Box } from '@mantine/core'
import { useParams } from 'next/navigation'
import { createOrgCodeEnvAction, updateOrgCodeEnvAction } from './code-envs.actions'
import {
    createOrgCodeEnvSchema,
    editOrgCodeEnvSchema,
    createOrgCodeEnvFormSchema,
    editOrgCodeEnvFormSchema,
} from './code-envs.schema'
import { ActionSuccessType } from '@/lib/types'
import { basename } from '@/lib/paths'
import { Language, EnvVar } from '@/database/types'
import { TrashIcon, PlusCircleIcon } from '@phosphor-icons/react/dist/ssr'

type CodeEnv = ActionSuccessType<typeof createOrgCodeEnvAction>
type CreateFormValues = z.infer<typeof createOrgCodeEnvSchema>
type EditFormValues = z.infer<typeof editOrgCodeEnvSchema>

interface EnvVarLineProps {
    envVar: EnvVar
    onNameChange: (name: string) => void
    onValueChange: (value: string) => void
    onRemove: () => void
}

function EnvVarLine({ envVar, onNameChange, onValueChange, onRemove }: EnvVarLineProps) {
    return (
        <Group gap="xs" align="flex-start">
            <TextInput
                value={envVar.name}
                onChange={(e) => onNameChange(e.target.value)}
                style={{ flex: 1 }}
                placeholder="Variable name"
            />
            <TextInput
                value={envVar.value}
                onChange={(e) => onValueChange(e.target.value)}
                style={{ flex: 1 }}
                placeholder="Value"
                error={!envVar.value.trim() ? 'Value is required' : null}
            />
            <ActionIcon color="red" variant="subtle" onClick={onRemove} mt={4}>
                <TrashIcon size={16} />
            </ActionIcon>
        </Group>
    )
}

interface CodeEnvFormProps {
    image?: CodeEnv
    onCompleteAction: () => void
}

type CreateFormSchema = z.infer<typeof createOrgCodeEnvFormSchema>
type EditFormSchema = z.infer<typeof editOrgCodeEnvFormSchema>
type FormValues = CreateFormSchema | EditFormSchema

export function CodeEnvForm({ image, onCompleteAction }: CodeEnvFormProps) {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const isEditMode = !!image

    const formSchema = isEditMode ? editOrgCodeEnvFormSchema : createOrgCodeEnvFormSchema

    const form = useForm<FormValues>({
        initialValues: {
            name: image?.name || '',
            cmdLine: image?.cmdLine || '',
            language: (image?.language || 'R') as Language,
            url: image?.url || '',
            isTesting: image?.isTesting || false,
            starterCode: undefined,
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

    const { mutate: saveCodeEnv, isPending } = useMutation({
        mutationFn: async (values: CreateFormValues | EditFormValues) => {
            if (isEditMode) {
                return await updateOrgCodeEnvAction({ orgSlug, imageId: image.id, ...values })
            }
            const createValues = values as CreateFormValues
            return await createOrgCodeEnvAction({ orgSlug, ...createValues })
        },
        onSuccess: () => {
            reportSuccess(
                isEditMode ? 'Code environment updated successfully' : 'Code environment added successfully',
            )
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

    return (
        <form onSubmit={onSubmit}>
            <Stack>
                <TextInput label="Name" placeholder="e.g., R 4.2.0 Code Environment" {...form.getInputProps('name')} />
                <TextInput
                    label="Command Line"
                    placeholder="Rscript %f"
                    description="Command used to execute scripts.  %f will be subsituted with main code file"
                    {...form.getInputProps('cmdLine')}
                />

                <Select
                    label="Language"
                    placeholder="Select language"
                    data={[
                        { value: 'R', label: 'R' },
                        { value: 'PYTHON', label: 'Python' },
                    ]}
                    {...form.getInputProps('language')}
                />
                <TextInput
                    label="URL to code environment"
                    placeholder="e.g., harbor.safeinsights.org/openstax/r-base:2025-05-15"
                    {...form.getInputProps('url')}
                />
                <FileInput
                    label="Starter Code"
                    description={
                        isEditMode
                            ? 'Upload a new file to replace the existing starter code (optional)'
                            : 'Upload starter code to assist Researchers with their coding experience.'
                    }
                    placeholder="Select a file"
                    {...form.getInputProps('starterCode')}
                />
                {isEditMode && image.starterCodePath && (
                    <Text size="sm" c="dimmed">
                        Current file: {basename(image.starterCodePath)}
                    </Text>
                )}
                <Checkbox
                    label="Is Testing Image"
                    description="Only admins will be able to select testing images"
                    {...form.getInputProps('isTesting', { type: 'checkbox' })}
                    mt="sm"
                />

                <Box mt="md">
                    <Text fw={500} size="sm" mb={4}>
                        Environment Variables
                    </Text>
                    <Text size="xs" c="dimmed" mb="sm">
                        Define environment variables available to the container
                    </Text>

                    <Stack gap="xs">
                        {form.values.settings.environment.map((envVar, index) => (
                            <EnvVarLine
                                key={index}
                                envVar={envVar}
                                onNameChange={(name) => updateEnvVarName(index, name)}
                                onValueChange={(value) => updateEnvVarValue(index, value)}
                                onRemove={() => removeEnvVar(index)}
                            />
                        ))}

                        <Group gap="xs" align="flex-start">
                            <TextInput
                                {...form.getInputProps('newEnvKey')}
                                placeholder="Variable name"
                                style={{ flex: 1 }}
                            />
                            <TextInput {...form.getInputProps('newEnvValue')} placeholder="Value" style={{ flex: 1 }} />
                            <ActionIcon color="blue" variant="subtle" onClick={addEnvVar} mt={4}>
                                <PlusCircleIcon size={16} />
                            </ActionIcon>
                        </Group>
                    </Stack>
                </Box>

                <Button type="submit" loading={isPending} mt="md">
                    {isEditMode ? 'Update Code Environment' : 'Save Code Environment'}
                </Button>
            </Stack>
        </form>
    )
}
