'use client'

import { Stack, TextInput, Textarea, Text, Grid } from '@mantine/core'
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

const FormLabel = ({ label, required = false }: { label: string; required?: boolean }) => (
    <Text fw={600} size="sm">
        {label}
        {required && (
            <Text span c="red" ml={4}>
                *
            </Text>
        )}
    </Text>
)

export function AdminSettingsForm({ form }: AdminSettingsFormProps) {
    const labelSpan = { base: 12, sm: 3, md: 2, lg: 2 }
    const inputSpan = { base: 12, sm: 9, md: 6, lg: 4 }

    return (
        <Stack gap="lg">
            <Grid align="flex-start">
                <Grid.Col span={labelSpan}>
                    <FormLabel label="Name" required />
                </Grid.Col>
                <Grid.Col span={inputSpan}>
                    <TextInput
                        aria-label="Name"
                        required
                        aria-required="true"
                        autoFocus
                        key={form.key('name')}
                        {...form.getInputProps('name')}
                    />
                </Grid.Col>
            </Grid>
            <Grid align="flex-start">
                <Grid.Col span={labelSpan}>
                    <FormLabel label="Description" />
                </Grid.Col>
                <Grid.Col span={inputSpan}>
                    <Textarea
                        aria-label="Description"
                        maxLength={250}
                        key={form.key('description')}
                        {...form.getInputProps('description')}
                        autosize
                        minRows={3}
                    />
                    <Text size="xs" c="dimmed" mt="xs">
                        {(form.values.description || '').length}/250 characters
                    </Text>
                </Grid.Col>
            </Grid>
        </Stack>
    )
}
