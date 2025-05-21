'use client'

import { notifications } from '@mantine/notifications'
import { Paper, Group, Button, Flex, Title, Divider, Loader } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { OrganizationSettingsEdit, settingsFormSchema, type SettingsFormValues } from './organization-settings-edit'
import { useForm } from '@mantine/form'
import { zodResolver } from 'mantine-form-zod-resolver'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { updateOrgSettingsAction, getOrgFromSlugAction } from '@/server/actions/org.actions'
import { handleMutationErrorsWithForm } from '@/components/errors'
import { OrganizationSettingsDisplay } from './organization-settings-display'

export const orgSettingsLabelSpan = { base: 12, sm: 3, md: 2, lg: 2 }
export const orgSettingsValueSpan = { base: 12, sm: 9, md: 6, lg: 4 }

interface OrganizationSettingsManagerProps {
    orgSlug: string
    // the server‐fetched org so we can hydrate immediately
    initialOrg?: { name: string; description: string | null }
}

export function OrganizationSettingsManager({ orgSlug, initialOrg }: OrganizationSettingsManagerProps) {
    const [isEditing, { open: startEdit, close: cancelEdit }] = useDisclosure(false)
    const queryClient = useQueryClient()

    const { data: org } = useQuery({
        queryKey: ['org', orgSlug],
        queryFn: () => getOrgFromSlugAction(orgSlug),
        initialData: initialOrg,
        staleTime: 1000 * 60, // we do not need to refresh org data very often
    })

    const form = useForm<SettingsFormValues>({
        initialValues: {
            name: org?.name ?? '',
            description: org?.description ?? '',
        },
        validate: zodResolver(settingsFormSchema),
        validateInputOnBlur: true,
    })

    const { mutate: updateOrgSettings, isPending: isOrgUpdating } = useMutation({
        mutationFn: updateOrgSettingsAction,
        onSuccess: (data, variables) => {
            notifications.show({ title: 'Success', message: data.message, color: 'green' })
            cancelEdit()
            form.resetDirty({ name: variables.name, description: variables.description ?? '' })
            queryClient.invalidateQueries({ queryKey: ['org', orgSlug] })
        },
        onError: handleMutationErrorsWithForm(form),
    })

    if (!org) return <Loader />

    const onFormSubmit = (values: SettingsFormValues) => {
        updateOrgSettings({
            orgSlug,
            name: values.name,
            description: values.description,
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

    let actionButtons: React.ReactNode
    let content: React.ReactNode

    if (isEditing) {
        actionButtons = (
            <Group>
                <Button variant="default" onClick={handleCancel}>
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
        )
        content = <OrganizationSettingsEdit form={form} onFormSubmit={onFormSubmit} />
    } else {
        actionButtons = (
            <Button variant="subtle" onClick={handleStartEdit}>
                Edit
            </Button>
        )
        content = <OrganizationSettingsDisplay org={org} />
    }

    return (
        <Paper shadow="xs" p="xl" mb="xl">
            <Flex direction="row" justify={'space-between'} align="center" mb="lg">
                <Title order={3}>About organization</Title>
                {actionButtons}
            </Flex>
            <Divider mb="lg" />
            {content}
        </Paper>
    )
}
