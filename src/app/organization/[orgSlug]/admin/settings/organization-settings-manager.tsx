'use client'

import { useEffect } from 'react'
import { notifications } from '@mantine/notifications'
import { Paper, Stack, Text, Group, Button, Flex, Title, Divider, Grid, Loader } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { AdminSettingsForm, settingsFormSchema, type SettingsFormValues } from './settings-form'
import { useForm } from '@mantine/form'
import { zodResolver } from 'mantine-form-zod-resolver'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { updateOrgSettingsAction, getOrgFromSlugAction } from '@/server/actions/org.actions'

interface OrganizationSettingsManagerProps {
    orgSlug: string
}

export function OrganizationSettingsManager({ orgSlug }: OrganizationSettingsManagerProps) {
    const [isEditing, { open: startEdit, close: cancelEdit }] = useDisclosure(false)
    const queryClient = useQueryClient()

    const { data: org, isLoading } = useQuery({
        queryKey: ['org', orgSlug],
        queryFn: () => getOrgFromSlugAction(orgSlug),
    })

    const form = useForm<SettingsFormValues>({
        initialValues: {
            name: org?.name ?? '',
            description: org?.description ?? '',
        },
        validate: zodResolver(settingsFormSchema),
        validateInputOnBlur: true,
    })

    const { setValues } = form

    const updateOrgSettingsMutation = useMutation({
        mutationFn: updateOrgSettingsAction,
        onSuccess: (data, variables) => {
            notifications.show({ title: 'Success', message: data.message, color: 'green' })
            cancelEdit()
            form.resetDirty({ name: variables.name, description: variables.description ?? '' })
            queryClient.invalidateQueries({ queryKey: ['org', orgSlug] })
        },
        onError: (error) =>
            notifications.show({
                title: 'Error updating settings',
                message: (error as Error).message || 'An unexpected error occurred.',
                color: 'red',
            }),
    })

    if (isLoading || !org) return <Loader />

    const labelSpan = { base: 12, sm: 3, md: 2, lg: 2 }
    const valueSpan = { base: 12, sm: 9, md: 6, lg: 4 }

    const onFormSubmit = (values: SettingsFormValues) => {
        updateOrgSettingsMutation.mutate({
            orgSlug,
            name: values.name,
            description: values.description ?? null,
        })
    }

    const handleCancel = () => {
        form.reset()
        cancelEdit()
    }

    const handleStartEdit = () => {
        if (org) {
            // Populate form with current org data at the moment editing starts
            form.setValues({ name: org.name, description: org.description ?? '' })
            form.resetDirty({ name: org.name, description: org.description ?? '' })
        }
        startEdit()
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
                            disabled={!form.isDirty() || !form.isValid() || updateOrgSettingsMutation.isPending}
                            loading={updateOrgSettingsMutation.isPending}
                        >
                            Save
                        </Button>
                    </Group>
                ) : (
                    <Button variant="subtle" onClick={handleStartEdit}>
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
                <Stack gap="lg">
                    <Grid align="flex-start">
                        <Grid.Col span={labelSpan}>
                            <Text fw={600} size="sm">
                                Name
                            </Text>
                        </Grid.Col>
                        <Grid.Col span={valueSpan}>
                            <Text size="sm">{org.name}</Text>
                        </Grid.Col>
                    </Grid>
                    <Grid align="flex-start">
                        <Grid.Col span={labelSpan}>
                            <Text fw={600} size="sm">
                                Description
                            </Text>
                        </Grid.Col>
                        <Grid.Col span={valueSpan}>
                            <Text
                                size="sm"
                                c={org.description ? undefined : 'dimmed'}
                                style={{ whiteSpace: 'pre-wrap' }}
                            >
                                {org.description || 'Not set'}
                            </Text>
                        </Grid.Col>
                    </Grid>
                </Stack>
            )}
        </Paper>
    )
}
