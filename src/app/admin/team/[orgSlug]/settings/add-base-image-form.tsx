'use client'

import { useForm, useMutation, z, zodResolver } from '@/common'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { Button, Checkbox, FileInput, Select, Stack, TextInput } from '@mantine/core'
import { useParams } from 'next/navigation'
import { createOrgBaseImageAction } from './base-images.actions'
import { orgBaseImageFormSchema } from './base-images.schema'

type FormValues = z.infer<typeof orgBaseImageFormSchema>

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
            isTesting: false,
            skeletonCode: undefined,
        },
        validate: zodResolver(orgBaseImageFormSchema),
    })

    const { mutate: updateBaseImage, isPending } = useMutation({
        mutationFn: createOrgBaseImageAction,
        onSuccess: () => {
            reportSuccess('Base image added successfully')
            onCompleteAction()
        },
        onError: reportMutationError('Failed to add base image'),
    })

    const onSubmit = form.onSubmit((values) => {
        updateBaseImage({
            orgSlug,
            name: values.name,
            cmdLine: values.cmdLine,
            language: (values.language ?? '').toLowerCase() as 'r' | 'python',
            baseImageUrl: values.url,
            isTesting: values.isTesting,
        })
    })

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
                        { value: 'r', label: 'R' },
                        { value: 'python', label: 'Python' },
                    ]}
                    {...form.getInputProps('language')}
                />
                <TextInput
                    placeholder="e.g., harbor.safeinsights.org/openstax/r-base:2025-05-15"
                    {...form.getInputProps('url')}
                />
                <FileInput
                    label="Starter Code"
                    description="Upload starter code to assist Researchers with their coding experience."
                    placeholder="Select a file"
                    {...form.getInputProps('skeletonCode')}
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
