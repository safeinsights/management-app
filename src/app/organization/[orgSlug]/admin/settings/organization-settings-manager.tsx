'use client'

import { notifications } from '@mantine/notifications'
import { useState, useEffect } from 'react'
import { Paper, Stack, Text, Group, Button, Flex, Title, Divider } from '@mantine/core'
import { AdminSettingsForm, settingsFormSchema, type SettingsFormValues } from './settings-form'
import { useForm } from '@mantine/form'
import { zodResolver } from 'mantine-form-zod-resolver'

interface OrganizationSettingsManagerProps {
    orgSlug: string
    initialName: string | null
    initialDescription: string | null
}

const ReadOnlyField: React.FC<{ label: string; value: string | null }> = ({ label, value }) => (
    <Stack gap="xs" mt="lg">
        <Text fw={500} size="sm">
            {label}
        </Text>
        <Text size="sm" c={value ? undefined : 'dimmed'}>
            {value || (value === null ? 'Not set' : '')}
        </Text>
    </Stack>
)

export function OrganizationSettingsManager({
    orgSlug,
    initialName,
    initialDescription,
}: OrganizationSettingsManagerProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [currentName, setCurrentName] = useState(initialName)
    const [currentDescription, setCurrentDescription] = useState(initialDescription)

    const form = useForm<SettingsFormValues>({
        initialValues: {
            name: initialName || '',
            description: initialDescription || '',
        },
        validate: zodResolver(settingsFormSchema),
    })

    useEffect(() => {
        setCurrentName(initialName)
        setCurrentDescription(initialDescription)
        form.setValues({
            name: initialName || '',
            description: initialDescription || '',
        })
        form.resetDirty({
            name: initialName || '',
            description: initialDescription || '',
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialName, initialDescription])

    const onFormSubmit = (values: SettingsFormValues) => {
        notifications.show({
            title: 'TODO: Implement Save',
            message: `Saving to DB here. OrgSlug: ${orgSlug}, Values: ${JSON.stringify(values)}`,
            color: 'blue',
        })
        setCurrentName(values.name)
        setCurrentDescription(values.description || null)
        setIsEditing(false)
        form.resetDirty(values)
    }

    const handleCancel = () => {
        form.reset()
        setIsEditing(false)
    }

    return (
        <Paper shadow="xs" p="xl" mb="xl">
            <Flex direction="row" justify={'space-between'} align="center" mb="lg">
                <Title order={3}>About organization</Title>
                {isEditing ? (
                    <Group>
                        <Button variant="default" onClick={handleCancel}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            form="organization-settings-form"
                            disabled={!form.isDirty() || !form.isValid()}
                        >
                            Save
                        </Button>
                    </Group>
                ) : (
                    <Button variant="subtle" onClick={() => setIsEditing(true)}>
                        Edit
                    </Button>
                )}
            </Flex>
            <Divider mb="lg" />

            {isEditing ? (
                <form id="organization-settings-form" onSubmit={form.onSubmit(onFormSubmit)}>
                    <AdminSettingsForm form={form} />
                </form>
            ) : (
                <Stack gap="md">
                    <ReadOnlyField label="Name" value={currentName} />
                    <ReadOnlyField label="Description" value={currentDescription} />
                </Stack>
            )}
        </Paper>
    )
}
