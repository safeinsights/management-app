'use client'

import { Button, Select, Stack, TextInput, Checkbox, FileInput } from '@mantine/core'
import { useMutation, zodResolver, z, useForm } from '@/common'
import { useParams } from 'next/navigation'
import { createOrgBaseImageAction } from './base-images.actions'
import { Language } from '@/database/types'
import { reportSuccess } from '@/components/notices'
import { reportMutationError } from '@/components/errors'
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
            language: 'R' as Language,
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
        const formData = new FormData()
        formData.append('name', values.name)
        formData.append('cmdLine', values.cmdLine)
        formData.append('language', values.language)
        formData.append('url', values.url)
        formData.append('isTesting', values.isTesting.toString())
        if (values.skeletonCode) {
            formData.append('skeletonCode', values.skeletonCode)
        }

        updateBaseImage({ orgSlug, formData })
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
                        { value: 'R', label: 'R' },
                        { value: 'Python', label: 'Python' },
                    ]}
                    {...form.getInputProps('language')}
                />
                <TextInput
                    label="Location"
                    description="network path where base image is stored, including tag"
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
