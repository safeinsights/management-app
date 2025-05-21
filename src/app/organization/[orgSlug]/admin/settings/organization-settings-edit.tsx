'use client'

import { type UseFormReturnType } from '@mantine/form'
import { Stack, TextInput, Textarea, Text, Grid } from '@mantine/core'
import { z } from 'zod'
import { orgSchema as baseOrgSchema } from '@/schema/org'

export const settingsFormSchema = baseOrgSchema.pick({ name: true }).extend({
    description: z.string().max(250, 'Word limit is 250 characters').default(''),
})

export type SettingsFormValues = z.infer<typeof settingsFormSchema>

interface OrganizationSettingsEditProps {
    form: UseFormReturnType<SettingsFormValues>
    onFormSubmit: (values: SettingsFormValues) => void
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

export function OrganizationSettingsEdit({ form, onFormSubmit }: OrganizationSettingsEditProps) {
    const labelSpan = { base: 12, sm: 3, md: 2, lg: 2 }
    const inputSpan = { base: 12, sm: 9, md: 6, lg: 4 }

    return (
        <form id="organization-settings-form" onSubmit={form.onSubmit(onFormSubmit)}>
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
                            maxLength={50}
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
        </form>
    )
}
