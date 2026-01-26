'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useForm, zodResolver } from '@/common'
import { Button, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { updatePersonalInfoAction } from '@/server/actions/researcher-profile.actions'
import { personalInfoSchema, type PersonalInfoValues } from '@/schema/researcher-profile'
import { FormFieldLabel } from '@/components/form-field-label'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface PersonalInfoSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
}

export function PersonalInfoSection({ data, refetch }: PersonalInfoSectionProps) {
    const [isEditing, setIsEditing] = useState(true)

    const defaults: PersonalInfoValues = useMemo(
        () => ({
            firstName: data?.user.firstName ?? '',
            lastName: data?.user.lastName ?? '',
        }),
        [data?.user.firstName, data?.user.lastName],
    )

    const form = useForm<PersonalInfoValues>({
        mode: 'controlled',
        initialValues: defaults,
        validate: zodResolver(personalInfoSchema),
        validateInputOnBlur: true,
    })

    useEffect(() => {
        form.setValues(defaults)
        form.resetDirty(defaults)
        const complete = Boolean(defaults.firstName) && Boolean(defaults.lastName)
        setIsEditing(!complete)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tie to computed defaults
    }, [defaults.firstName, defaults.lastName])

    useEffect(() => {
        form.validate()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- run once
    }, [])

    const saveMutation = useMutation({
        mutationFn: async (values: PersonalInfoValues) => updatePersonalInfoAction(values),
        onSuccess: async (res) => {
            if (res && 'error' in res) {
                notifications.show({ title: 'Save failed', message: String(res.error), color: 'red' })
                return
            }
            await refetch()
            setIsEditing(false)
            notifications.show({ title: 'Saved', message: 'Personal information updated', color: 'green' })
        },
    })

    return (
        <Paper p="xl" radius="sm">
            <Group justify="space-between" align="center" mb="md">
                <Title order={3}>Personal information</Title>
                {!isEditing && (
                    <Button variant="subtle" onClick={() => setIsEditing(true)}>
                        Edit
                    </Button>
                )}
            </Group>

            {isEditing ? (
                <form onSubmit={form.onSubmit((values) => saveMutation.mutate(values))}>
                    <Group grow align="flex-start">
                        <div>
                            <FormFieldLabel label="First name" required inputId="firstName" />
                            <TextInput
                                id="firstName"
                                placeholder="Enter your first name"
                                {...form.getInputProps('firstName')}
                            />
                        </div>
                        <div>
                            <FormFieldLabel label="Last name" required inputId="lastName" />
                            <TextInput
                                id="lastName"
                                placeholder="Enter your last name"
                                {...form.getInputProps('lastName')}
                            />
                        </div>
                    </Group>

                    <div style={{ marginTop: 16 }}>
                        <FormFieldLabel label="Email address" required inputId="email" />
                        <TextInput
                            id="email"
                            value={data?.user.email ?? ''}
                            placeholder="you@university.edu"
                            disabled
                        />
                    </div>

                    <Group justify="flex-end" mt="xl">
                        <Button
                            type="submit"
                            disabled={!form.isValid() || saveMutation.isPending}
                            loading={saveMutation.isPending}
                        >
                            Save changes
                        </Button>
                    </Group>
                </form>
            ) : (
                <Stack gap="sm">
                    <Group grow>
                        <div>
                            <Text fw={600} size="sm">
                                First name
                            </Text>
                            <Text>{data?.user.firstName || ''}</Text>
                        </div>
                        <div>
                            <Text fw={600} size="sm">
                                Last name
                            </Text>
                            <Text>{data?.user.lastName || ''}</Text>
                        </div>
                    </Group>
                    <div>
                        <Text fw={600} size="sm">
                            Email address
                        </Text>
                        <Text>{data?.user.email || ''}</Text>
                    </div>
                </Stack>
            )}
        </Paper>
    )
}
