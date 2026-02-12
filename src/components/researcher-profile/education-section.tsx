'use client'

import { Button, Checkbox, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core'
import { useEducationSection } from '@/hooks/use-education-section'
import { SectionHeader } from '@/components/researcher-profile/section-header'
import { DisplayField } from '@/components/researcher-profile/display-field'
import { FormFieldLabel } from '@/components/form-field-label'
import { DEGREE_OPTIONS } from '@/lib/degree-options'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'
import type { EducationValues } from '@/schema/researcher-profile'
import type { UseFormReturnType } from '@mantine/form'

interface EducationSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
    readOnly?: boolean
}

interface EducationEditFormProps {
    form: UseFormReturnType<EducationValues>
    isPending: boolean
    onSubmit: (values: EducationValues) => void
}

interface EducationDisplayProps {
    defaults: EducationValues
}

function EducationEditForm({ form, isPending, onSubmit }: EducationEditFormProps) {
    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack gap="md">
                <div>
                    <FormFieldLabel label="Educational institution" required inputId="educationalInstitution" />
                    <TextInput
                        id="educationalInstitution"
                        placeholder="Ex: Rice University"
                        {...form.getInputProps('educationalInstitution')}
                    />
                </div>

                <Group grow align="flex-start">
                    <div>
                        <FormFieldLabel label="Degree" required inputId="degree" />
                        <Select
                            id="degree"
                            searchable
                            placeholder="Select your degree"
                            data={DEGREE_OPTIONS}
                            {...form.getInputProps('degree')}
                        />
                    </div>
                    <div>
                        <FormFieldLabel label="Field of study" required inputId="fieldOfStudy" />
                        <TextInput
                            id="fieldOfStudy"
                            placeholder="Ex: Systems and Cognitive Neuroscience"
                            {...form.getInputProps('fieldOfStudy')}
                        />
                    </div>
                </Group>

                <Checkbox
                    label="I am currently pursuing this degree and have not yet graduated."
                    {...form.getInputProps('isCurrentlyPursuing', { type: 'checkbox' })}
                />

                <Group justify="flex-end" mt="xl">
                    <Button type="submit" disabled={!form.isValid() || isPending} loading={isPending}>
                        Save changes
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}

function EducationDisplay({ defaults }: EducationDisplayProps) {
    const degreeLabel = defaults.isCurrentlyPursuing ? 'Degree (currently pursuing)' : 'Degree'

    return (
        <Stack gap="md">
            <DisplayField label="Educational institution">
                <Text>{defaults.educationalInstitution}</Text>
            </DisplayField>
            <Group grow>
                <DisplayField label={degreeLabel}>
                    <Text>{defaults.degree}</Text>
                </DisplayField>
                <DisplayField label="Field of study">
                    <Text>{defaults.fieldOfStudy}</Text>
                </DisplayField>
            </Group>
        </Stack>
    )
}

export function EducationSection({ data, refetch, readOnly = false }: EducationSectionProps) {
    const { form, isEditing, setIsEditing, defaults, isPending, handleSubmit } = useEducationSection(data, refetch)

    const hasData =
        Boolean(defaults.educationalInstitution) || Boolean(defaults.degree) || Boolean(defaults.fieldOfStudy)

    if (readOnly && !hasData) return null

    const showEditForm = !readOnly && isEditing

    return (
        <Paper p="xl" radius="sm">
            <SectionHeader
                title="Highest level of education"
                isEditing={isEditing}
                onEdit={() => setIsEditing(true)}
                showEditButton={!readOnly}
            />

            {showEditForm ? (
                <EducationEditForm form={form} isPending={isPending} onSubmit={handleSubmit} />
            ) : (
                <EducationDisplay defaults={defaults} />
            )}
        </Paper>
    )
}
