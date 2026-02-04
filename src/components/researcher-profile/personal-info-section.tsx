'use client'

import { Box, Button, Group, Paper, Stack, Text, TextInput } from '@mantine/core'
import { usePersonalInfoSection } from '@/hooks/use-personal-info-section'
import { SectionHeader } from '@/components/researcher-profile/section-header'
import { DisplayField } from '@/components/researcher-profile/display-field'
import { FormFieldLabel } from '@/components/form-field-label'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'
import type { PersonalInfoValues } from '@/schema/researcher-profile'
import type { UseFormReturnType } from '@mantine/form'

interface PersonalInfoSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
    readOnly?: boolean
}

interface PersonalInfoEditFormProps {
    form: UseFormReturnType<PersonalInfoValues>
    email: string
    isPending: boolean
    onSubmit: (values: PersonalInfoValues) => void
}

interface PersonalInfoDisplayProps {
    firstName: string
    lastName: string
    email: string
}

function PersonalInfoEditForm({ form, email, isPending, onSubmit }: PersonalInfoEditFormProps) {
    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
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
                    <TextInput id="lastName" placeholder="Enter your last name" {...form.getInputProps('lastName')} />
                </div>
            </Group>

            <Box mt="md">
                <FormFieldLabel label="Email address" required inputId="email" />
                <TextInput id="email" value={email} placeholder="you@university.edu" disabled />
            </Box>

            <Group justify="flex-end" mt="xl">
                <Button type="submit" disabled={!form.isValid() || isPending} loading={isPending}>
                    Save changes
                </Button>
            </Group>
        </form>
    )
}

function PersonalInfoDisplay({ firstName, lastName, email }: PersonalInfoDisplayProps) {
    return (
        <Stack gap="sm">
            <Group grow>
                <DisplayField label="First name">
                    <Text>{firstName}</Text>
                </DisplayField>
                <DisplayField label="Last name">
                    <Text>{lastName}</Text>
                </DisplayField>
            </Group>
            <DisplayField label="Email address">
                <Text>{email}</Text>
            </DisplayField>
        </Stack>
    )
}

export function PersonalInfoSection({ data, refetch, readOnly = false }: PersonalInfoSectionProps) {
    const { form, isEditing, setIsEditing, isPending, handleSubmit } = usePersonalInfoSection(data, refetch)

    const email = data?.user.email ?? ''
    const firstName = data?.user.firstName ?? ''
    const lastName = data?.user.lastName ?? ''

    const showEditForm = !readOnly && isEditing

    return (
        <Paper p="xl" radius="sm">
            <SectionHeader
                title="Personal information"
                isEditing={isEditing}
                onEdit={() => setIsEditing(true)}
                showEditButton={!readOnly}
            />

            {showEditForm ? (
                <PersonalInfoEditForm form={form} email={email} isPending={isPending} onSubmit={handleSubmit} />
            ) : (
                <PersonalInfoDisplay firstName={firstName} lastName={lastName} email={email} />
            )}
        </Paper>
    )
}
