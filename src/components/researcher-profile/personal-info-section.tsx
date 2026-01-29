'use client'

import { Box, Button, Group, Paper, Stack, Text, TextInput } from '@mantine/core'
import { usePersonalInfoSection } from '@/hooks/use-personal-info-section'
import { SectionHeader } from '@/components/researcher-profile/section-header'
import { DisplayField } from '@/components/researcher-profile/display-field'
import { FormFieldLabel } from '@/components/form-field-label'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface PersonalInfoSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
}

export function PersonalInfoSection({ data, refetch }: PersonalInfoSectionProps) {
    const { form, isEditing, setIsEditing, isPending, handleSubmit } = usePersonalInfoSection(data, refetch)

    return (
        <Paper p="xl" radius="sm">
            <SectionHeader title="Personal information" isEditing={isEditing} onEdit={() => setIsEditing(true)} />

            {isEditing ? (
                <form onSubmit={form.onSubmit(handleSubmit)}>
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

                    <Box mt="md">
                        <FormFieldLabel label="Email address" required inputId="email" />
                        <TextInput
                            id="email"
                            value={data?.user.email ?? ''}
                            placeholder="you@university.edu"
                            disabled
                        />
                    </Box>

                    <Group justify="flex-end" mt="xl">
                        <Button type="submit" disabled={!form.isValid() || isPending} loading={isPending}>
                            Save changes
                        </Button>
                    </Group>
                </form>
            ) : (
                <Stack gap="sm">
                    <Group grow>
                        <DisplayField label="First name">
                            <Text>{data?.user.firstName || ''}</Text>
                        </DisplayField>
                        <DisplayField label="Last name">
                            <Text>{data?.user.lastName || ''}</Text>
                        </DisplayField>
                    </Group>
                    <DisplayField label="Email address">
                        <Text>{data?.user.email || ''}</Text>
                    </DisplayField>
                </Stack>
            )}
        </Paper>
    )
}
