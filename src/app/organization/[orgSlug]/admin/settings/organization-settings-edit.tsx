'use client'

import { type UseFormReturnType } from '@mantine/form'
import { Stack, TextInput, Textarea, Grid, Text } from '@mantine/core'
import { FormFieldLabel } from '@/components/form-field-label' // adjust path if needed
import { z } from 'zod'
import { orgSchema as baseOrgSchema } from '@/schema/org'
import { orgSettingsLabelSpan, orgSettingsValueSpan } from './organization-settings-manager'

export const settingsFormSchema = baseOrgSchema.pick({ name: true }).extend({
    description: z.string().max(250, 'Word limit is 250 characters').default(''),
})

export type SettingsFormValues = z.infer<typeof settingsFormSchema>

interface OrganizationSettingsEditProps {
    form: UseFormReturnType<SettingsFormValues>
    onFormSubmit: (values: SettingsFormValues) => void
}

export function OrganizationSettingsEdit({ form, onFormSubmit }: OrganizationSettingsEditProps) {
    return (
        <form id="organization-settings-form" onSubmit={form.onSubmit(onFormSubmit)}>
            <Stack gap="lg">
                <Grid align="flex-start">
                    <Grid.Col span={orgSettingsLabelSpan}>
                        <FormFieldLabel label="Name" required inputId={form.key('name')} variant="orgset" />
                    </Grid.Col>
                    <Grid.Col span={orgSettingsValueSpan}>
                        <TextInput
                            id={form.key('name')}
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
                    <Grid.Col span={orgSettingsLabelSpan}>
                        <FormFieldLabel label="Description" inputId={form.key('description')} variant="orgset" />
                    </Grid.Col>
                    <Grid.Col span={orgSettingsValueSpan}>
                        <Textarea
                            id={form.key('description')}
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
