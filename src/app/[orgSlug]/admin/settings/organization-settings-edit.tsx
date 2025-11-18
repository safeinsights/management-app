'use client'

import { Stack, TextInput, Textarea, Grid, Text, Flex, Title, Button, Group, Divider } from '@mantine/core'
import { useForm, type UseFormReturnType } from '@mantine/form'
import { zodResolver, useMutation } from '@/common'
import { notifications } from '@mantine/notifications'
import { FormFieldLabel } from '@/components/form-field-label'
import { z } from 'zod'
import { type Org } from '@/schema/org'
import { updateOrgSettingsAction } from '@/server/actions/org.actions'
import { handleMutationErrorsWithForm, InputError } from '@/components/errors'

interface FormFieldMessageProps {
    message: string
}

export const FormFieldMessage: React.FC<FormFieldMessageProps> = ({ message }) => {
    return (
        <Text size="xs" c="dimmed" mt="xs">
            {message}
        </Text>
    )
}

export const settingsFormSchema = z.object({
    name: z.string().min(1, 'Name is required').max(50, 'Name cannot exceed 50 characters'),
    description: z.string().max(250, 'Word limit is 250 characters').default(''),
})

export type SettingsFormValues = z.infer<typeof settingsFormSchema>

interface OrganizationSettingsEditProps {
    org: Org
    onSaveSuccess: () => void
    onCancel: () => void
}

export function OrganizationSettingsEdit({ org, onSaveSuccess, onCancel }: OrganizationSettingsEditProps) {
    const labelSpan = { base: 12, sm: 3, md: 2, lg: 2 }
    const inputSpan = { base: 12, sm: 9, md: 6, lg: 4 }

    const form: UseFormReturnType<SettingsFormValues> = useForm<SettingsFormValues>({
        initialValues: {
            name: org.name,
            description: org.description || '',
        },
        validate: zodResolver(settingsFormSchema),
        validateInputOnBlur: true,
        validateInputOnChange: true,
    })

    const { mutate: updateOrgSettings, isPending: isOrgUpdating } = useMutation({
        mutationFn: (values: SettingsFormValues) =>
            updateOrgSettingsAction({
                orgSlug: org.slug,
                name: values.name,
                description: values.description,
            }),
        onSuccess: (data) => {
            notifications.show({
                title: 'Success',
                message: data.message,
                color: 'green',
            })
            onSaveSuccess()
            form.resetDirty({ name: form.values.name, description: form.values.description })
        },
        onError: handleMutationErrorsWithForm(form),
    })

    const handleFormSubmit = (values: SettingsFormValues) => {
        updateOrgSettings(values)
    }

    return (
        <>
            <Flex direction="row" justify={'space-between'} align="center" mb="lg">
                <Title order={3}>About organization</Title>
                <Group>
                    <Button variant="default" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="organization-settings-form"
                        disabled={!form.isDirty() || !form.isValid()}
                        loading={isOrgUpdating}
                    >
                        Save
                    </Button>
                </Group>
            </Flex>
            <Divider mb="lg" />
            <form id="organization-settings-form" onSubmit={form.onSubmit(handleFormSubmit)}>
                <Stack gap="lg">
                    <Grid align="flex-start">
                        <Grid.Col span={labelSpan}>
                            <FormFieldLabel label="Name" required inputId={form.key('name')} variant="orgset" />
                        </Grid.Col>
                        <Grid.Col span={inputSpan}>
                            <TextInput
                                id={form.key('name')}
                                aria-label="Name"
                                required
                                aria-required="true"
                                autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- intentional for edit modal UX
                                key={form.key('name')}
                                {...form.getInputProps('name')}
                                error={
                                    form.errors.name && (
                                        <Group gap="xs">
                                            <InputError error={form.errors.name} />
                                            <span>{(form.values.name || '').length} /50 characters</span>
                                        </Group>
                                    )
                                }
                            />
                            {/* If there is no name error show the characters count */}
                            {form.errors.name && (
                                <FormFieldMessage message={(form.values.name || '').length + ' /50 characters'} />
                            )}
                        </Grid.Col>
                    </Grid>
                    <Grid align="flex-start">
                        <Grid.Col span={labelSpan}>
                            <FormFieldLabel label="Description" inputId={form.key('description')} variant="orgset" />
                        </Grid.Col>
                        <Grid.Col span={inputSpan}>
                            <Textarea
                                id={form.key('description')}
                                aria-label="Description"
                                key={form.key('description')}
                                {...form.getInputProps('description')}
                                autosize
                                minRows={3}
                                placeholder="Consider adding a sentence to publicly introduce your organization."
                                error={
                                    form.errors.description && (
                                        <Group gap="xs">
                                            <InputError error={form.errors.description} />
                                            <span>{(form.values.description || '').length} /250 characters</span>
                                        </Group>
                                    )
                                }
                            />
                            {/* If there is no description error show the characters count */}
                            <FormFieldMessage message={(form.values.description || '').length + '/250 characters'} />
                        </Grid.Col>
                    </Grid>
                </Stack>
            </form>
        </>
    )
}
