'use client'

import { Stack, TextInput, Textarea, Text } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { z } from 'zod'

export const settingsFormSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().max(250, 'Word limit is 250 characters').nullable().optional(),
})

export type SettingsFormValues = z.infer<typeof settingsFormSchema>

interface AdminSettingsFormProps {
    form: UseFormReturnType<SettingsFormValues>
}

export function AdminSettingsForm({ form }: AdminSettingsFormProps) {
    return (
        <Stack gap="lg">
            <TextInput
                label="Name"
                withAsterisk
                required
                aria-required="true"
                autoFocus
                key={form.key('name')}
                {...form.getInputProps('name')}
            />
            <Textarea
                label="Description"
                maxLength={250}
                key={form.key('description')}
                {...form.getInputProps('description')}
                autosize
                minRows={3}
            />
            <Text size="xs" c="dimmed" mt={-10} style={{ alignSelf: 'flex-start' }}>
                {(form.values.description || '').length}/250 characters
            </Text>
        </Stack>
    )
}
