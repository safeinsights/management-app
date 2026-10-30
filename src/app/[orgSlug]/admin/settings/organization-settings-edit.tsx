'use client'

import {
    Stack,
    TextInput,
    Textarea,
    Grid,
    Flex,
    Title,
    Button,
    Group,
    Divider,
    type InputWrapperProps,
} from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import { useForm, zodResolver, useMutation } from '@/common'
import { showToast } from '@/components/toast-notifications'
import { FormFieldLabel } from '@/components/form-field-label'
import { z } from 'zod'
import {
    ORG_DESCRIPTION_MAX_CHARACTERS,
    ORG_NAME_MAX_CHARACTERS,
    orgDescriptionField,
    orgNameField,
    type PublicOrg,
} from '@/schema/org'
import { updateOrgSettingsAction } from '@/server/actions/org.actions'
import { handleMutationErrorsWithForm } from '@/components/errors'
import { countCharacters } from '@/lib/field-limits'
import { resizableTextareaProps } from '@/components/textarea-resize'
import { useTextareaResizeFloor } from '@/hooks/use-textarea-resize-floor'

export const settingsFormSchema = z.object({
    name: orgNameField,
    description: orgDescriptionField.default(''),
})

const COUNTER_BELOW_INPUT: InputWrapperProps['inputWrapperOrder'] = ['label', 'input', 'description', 'error']

const characterCount = (value: string, maxCharacters: number) => `${countCharacters(value)}/${maxCharacters} characters`

export type SettingsFormValues = z.infer<typeof settingsFormSchema>

interface OrganizationSettingsEditProps {
    org: PublicOrg
    onSaveSuccess: () => void
    onCancel: () => void
}

export function OrganizationSettingsEdit({ org, onSaveSuccess, onCancel }: OrganizationSettingsEditProps) {
    const labelSpan = { base: 12, sm: 3, md: 2, lg: 2 }
    const inputSpan = { base: 12, sm: 9, md: 6, lg: 4 }
    const { ref: descriptionRef, floor: descriptionFloor } = useTextareaResizeFloor()

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
            showToast({
                category: 'success',
                title: 'Success',
                message: data.message,
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
                                autoFocus
                                key={form.key('name')}
                                {...form.getInputProps('name')}
                                description={
                                    form.errors.name
                                        ? characterCount(form.values.name, ORG_NAME_MAX_CHARACTERS)
                                        : undefined
                                }
                                inputWrapperOrder={COUNTER_BELOW_INPUT}
                            />
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
                                ref={descriptionRef}
                                rows={3}
                                {...resizableTextareaProps(descriptionFloor)}
                                placeholder="Consider adding a sentence to publicly introduce your organization."
                                description={characterCount(form.values.description, ORG_DESCRIPTION_MAX_CHARACTERS)}
                                inputWrapperOrder={COUNTER_BELOW_INPUT}
                            />
                        </Grid.Col>
                    </Grid>
                </Stack>
            </form>
        </>
    )
}
