'use client'

import { useForm, useMutation, z, zodResolver } from '@/common'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { Button, Checkbox, FileInput, Select, Stack, TextInput } from '@mantine/core'
import { useParams } from 'next/navigation'
import { createOrgBaseImageAction } from './base-images.actions'
import { orgBaseImageSchema } from './base-images.schema'
import { Language } from '@/database/types'

type FormValues = z.infer<typeof orgBaseImageSchema>

interface AddBaseImageFormProps {
    onCompleteAction: () => void
}

export function AddBaseImageForm({ onCompleteAction }: AddBaseImageFormProps) {
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const form = useForm<FormValues>({
        initialValues: {
            name: '',
            cmdLine: '',
            language: 'R',
            url: '',
            starterCode: new File([], ''),
            isTesting: false,
        },
        validate: zodResolver(orgBaseImageSchema),
    })

    const { mutate: createBaseImage, isPending } = useMutation({
        mutationFn: createOrgBaseImageAction,
        onSuccess: () => {
            reportSuccess('Base image added successfully')
            onCompleteAction()
        },
        onError: reportMutationError('Failed to add base image'),
    })

    const onSubmit = form.onSubmit((values) => createBaseImage({ orgSlug, ...values, language: values.language as Language }))

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
                    description="Upload starter code to assist Researchers with their coding experience."
                    placeholder="Select a file"
                    {...form.getInputProps('starterCode')}
                />
                <Checkbox
                    label="Is Testing Image"
                    description="Only admins will be able to select testing images"
                    {...form.getInputProps('isTesting', { type: 'checkbox' })}
                    mt="sm"
                />
                <Button type="submit" loading={isPending} mt="md">
                    Save Image
                </Button>
            </Stack>
        </form>
    )
}
