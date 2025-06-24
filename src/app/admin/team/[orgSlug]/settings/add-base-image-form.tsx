'use client'

import { Button, Select, Stack, TextInput, Checkbox } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zodResolver } from 'mantine-form-zod-resolver'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { createOrgBaseImageAction } from '@/server/actions/org-base-images.actions'
import { Language } from '@/database/types'
import { reportSuccess } from '@/components/notices'
import { reportMutationError } from '@/components/errors'

const formSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    language: z.enum(['R'], { message: 'Language must be R' }),
    url: z.string().url('Must be a valid URL').min(1, 'URL is required'),
    isTesting: z.boolean().default(false),
})

type FormValues = z.infer<typeof formSchema>

interface AddBaseImageFormProps {
    onCompleteAction: () => void
}

export function AddBaseImageForm({ onCompleteAction }: AddBaseImageFormProps) {
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const form = useForm<FormValues>({
        initialValues: {
            name: '',
            language: 'R' as Language,
            url: '',
            isTesting: false,
        },
        validate: zodResolver(formSchema),
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
        updateBaseImage({ orgSlug, ...values })
    })

    return (
        <form onSubmit={onSubmit}>
            <Stack>
                <TextInput label="Name" placeholder="e.g., R 4.2.0 Base Image" {...form.getInputProps('name')} />
                <Select
                    label="Language"
                    placeholder="Select language"
                    data={[{ value: 'R', label: 'R' }]}
                    {...form.getInputProps('language')}
                />
                <TextInput
                    label="URL"
                    placeholder="e.g., https://example.com/my-r-image:latest"
                    {...form.getInputProps('url')}
                />
                <Checkbox
                    label="Is Testing Image"
                    description="Only admins will be able to select testinng images"
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
