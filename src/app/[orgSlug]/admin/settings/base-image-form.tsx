'use client'

import { useForm, useMutation, z, zodResolver } from '@/common'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { Button, Checkbox, FileInput, Select, Stack, TextInput, Text, Group, ActionIcon, Box } from '@mantine/core'
import { useParams } from 'next/navigation'
import { createOrgBaseImageAction, updateOrgBaseImageAction } from './base-images.actions'
import {
    createOrgBaseImageSchema,
    editOrgBaseImageSchema,
    envVarKeySchema,
    envVarValueSchema,
} from './base-images.schema'
import { ActionSuccessType } from '@/lib/types'
import { basename } from '@/lib/paths'
import { Language } from '@/database/types'
import { TrashIcon, PlusCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { useState } from 'react'

type BaseImage = ActionSuccessType<typeof createOrgBaseImageAction>
type CreateFormValues = z.infer<typeof createOrgBaseImageSchema>
type EditFormValues = z.infer<typeof editOrgBaseImageSchema>

interface EnvVarLineProps {
    envKey: string
    value: string
    onValueChange: (value: string) => void
    onRemove: () => void
}

function EnvVarLine({ envKey, value, onValueChange, onRemove }: EnvVarLineProps) {
    return (
        <Group gap="xs" align="flex-start">
            <TextInput value={envKey} disabled style={{ flex: 1 }} placeholder="Variable name" />
            <TextInput
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                style={{ flex: 1 }}
                placeholder="Value"
                error={!value.trim() ? 'Value is required' : null}
            />
            <ActionIcon color="red" variant="subtle" onClick={onRemove} mt={4}>
                <TrashIcon size={16} />
            </ActionIcon>
        </Group>
    )
}

interface BaseImageFormProps {
    image?: BaseImage
    onCompleteAction: () => void
}

export function BaseImageForm({ image, onCompleteAction }: BaseImageFormProps) {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const isEditMode = !!image

    // Local state for adding new env var
    const [newEnvKey, setNewEnvKey] = useState('')
    const [newEnvValue, setNewEnvValue] = useState('')
    const [newEnvKeyError, setNewEnvKeyError] = useState<string | null>(null)
    const [newEnvValueError, setNewEnvValueError] = useState<string | null>(null)

    // Use different schemas for create vs edit mode
    const schema = isEditMode ? editOrgBaseImageSchema : createOrgBaseImageSchema

    const form = useForm<CreateFormValues | EditFormValues>({
        initialValues: {
            name: image?.name || '',
            cmdLine: image?.cmdLine || '',
            language: (image?.language || 'R') as Language,
            url: image?.url || '',
            isTesting: image?.isTesting || false,
            starterCode: undefined,
            envVars: (image?.envVars as Record<string, string>) || {},
        },
        validate: zodResolver(schema),
    })

    const addEnvVar = () => {
        const trimmedKey = newEnvKey.trim()
        const trimmedValue = newEnvValue.trim()

        // Validate key using zod schema
        const keyResult = envVarKeySchema.safeParse(trimmedKey)
        if (!keyResult.success) {
            setNewEnvKeyError(keyResult.error.issues[0].message)
            return
        }
        if (trimmedKey in form.values.envVars) {
            setNewEnvKeyError('Variable already exists')
            return
        }

        // Validate value using zod schema
        const valueResult = envVarValueSchema.safeParse(trimmedValue)
        if (!valueResult.success) {
            setNewEnvValueError(valueResult.error.issues[0].message)
            return
        }

        form.setFieldValue('envVars', { ...form.values.envVars, [trimmedKey]: trimmedValue })
        setNewEnvKey('')
        setNewEnvValue('')
        setNewEnvKeyError(null)
        setNewEnvValueError(null)
    }

    const updateEnvVarValue = (key: string, value: string) => {
        form.setFieldValue('envVars', { ...form.values.envVars, [key]: value })
    }

    const removeEnvVar = (key: string) => {
        const { [key]: _, ...rest } = form.values.envVars
        form.setFieldValue('envVars', rest)
    }

    const { mutate: saveBaseImage, isPending } = useMutation({
        mutationFn: async (values: CreateFormValues | EditFormValues) => {
            if (isEditMode) {
                return await updateOrgBaseImageAction({ orgSlug, imageId: image.id, ...values })
            }
            // In create mode, starterCode is required (validated by schema)
            const createValues = values as CreateFormValues
            return await createOrgBaseImageAction({ orgSlug, ...createValues })
        },
        onSuccess: () => {
            reportSuccess(isEditMode ? 'Base image updated successfully' : 'Base image added successfully')
            onCompleteAction()
        },
        onError: reportMutationError(isEditMode ? 'Failed to update base image' : 'Failed to add base image'),
    })

    const onSubmit = form.onSubmit((values) => saveBaseImage(values))

    return (
        <form onSubmit={onSubmit}>
            <Stack>
                <TextInput label="Name" placeholder="e.g., R 4.2.0 Base Image" {...form.getInputProps('name')} />
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
                    label="URL to base image"
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
                        {Object.entries(form.values.envVars).map(([key, value]) => (
                            <EnvVarLine
                                key={key}
                                envKey={key}
                                value={value}
                                onValueChange={(v) => updateEnvVarValue(key, v)}
                                onRemove={() => removeEnvVar(key)}
                            />
                        ))}

                        <Group gap="xs" align="flex-start">
                            <TextInput
                                value={newEnvKey}
                                onChange={(e) => {
                                    setNewEnvKey(e.target.value)
                                    setNewEnvKeyError(null)
                                }}
                                placeholder="Variable name"
                                style={{ flex: 1 }}
                                error={newEnvKeyError}
                            />
                            <TextInput
                                value={newEnvValue}
                                onChange={(e) => {
                                    setNewEnvValue(e.target.value)
                                    setNewEnvValueError(null)
                                }}
                                placeholder="Value"
                                style={{ flex: 1 }}
                                error={newEnvValueError}
                            />
                            <ActionIcon color="blue" variant="subtle" onClick={addEnvVar} mt={4}>
                                <PlusCircleIcon size={16} />
                            </ActionIcon>
                        </Group>
                    </Stack>
                </Box>

                <Button type="submit" loading={isPending} mt="md">
                    {isEditMode ? 'Update Image' : 'Save Image'}
                </Button>
            </Stack>
        </form>
    )
}
