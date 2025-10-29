'use client'

import { useForm, useMutation, z, zodResolver } from '@/common'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { Button, Checkbox, FileInput, Select, Stack, TextInput, Text } from '@mantine/core'
import { useParams } from 'next/navigation'
import { createOrgBaseImageAction, updateOrgBaseImageAction } from './base-images.actions'
import { orgBaseImageSchema } from './base-images.schema'
import { ActionSuccessType } from '@/lib/types'
import { basename } from '@/lib/paths'
import { Language } from '@/database/types'

type BaseImage = ActionSuccessType<typeof createOrgBaseImageAction>
type FormValues = z.infer<typeof orgBaseImageSchema>

interface BaseImageFormProps {
    image?: BaseImage
    onCompleteAction: () => void
}

export function BaseImageForm({ image, onCompleteAction }: BaseImageFormProps) {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const isEditMode = !!image

    const form = useForm<FormValues>({
        initialValues: {
            name: image?.name || '',
            cmdLine: image?.cmdLine || '',
            language: (image?.language || 'R') as Language,
            url: image?.url || '',
            isTesting: image?.isTesting || false,
            starterCode: new File([], ''),
        },
        validate: zodResolver(orgBaseImageSchema),
    })

    const { mutate: saveBaseImage, isPending } = useMutation({
        mutationFn: async (values: FormValues) => {
            if (isEditMode) {
                return await updateOrgBaseImageAction({ orgSlug, imageId: image.id, ...values })
            }
            // In create mode, starterCode is required
            if (!values.starterCode || values.starterCode.size === 0) {
                throw new Error('Starter code file is required')
            }
            return await createOrgBaseImageAction({ orgSlug, ...values, starterCode: values.starterCode })
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
                <Button type="submit" loading={isPending} mt="md">
                    {isEditMode ? 'Update Image' : 'Save Image'}
                </Button>
            </Stack>
        </form>
    )
}
