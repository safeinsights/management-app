'use client'

import { Button, Select, Stack, TextInput, Checkbox } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zodResolver } from 'mantine-form-zod-resolver'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { createOrgBaseImageAction } from './base-images.actions'
import { Language } from '@/database/types'
import { reportSuccess } from '@/components/notices'
import { reportMutationError } from '@/components/errors'
import { orgBaseImageSchema } from './base-images.schema'

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
            language: 'R' as Language,
            url: '',
            isTesting: false,
        },
        validate: zodResolver(orgBaseImageSchema),
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
                <TextInput
                    label="Command Line"
                    placeholder="Rscript %f"
                    description="Command used to execute scripts.  %f will be subsituted with main code file"
                    {...form.getInputProps('cmd_line')}
                />
                <Select
                    label="Language"
                    placeholder="Select language"
                    data={[{ value: 'R', label: 'R' }]}
                    {...form.getInputProps('language')}
                />
                <TextInput
                    label="Location"
                    description="network path where base image is stored, including tag"
                    placeholder="e.g., harbor.safeinsights.org/openstax/r-base:2025-05-15"
                    {...form.getInputProps('url')}
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
