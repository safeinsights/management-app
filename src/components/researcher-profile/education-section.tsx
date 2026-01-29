'use client'

import { Button, Checkbox, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core'
import { useEducationSection } from '@/hooks/use-education-section'
import { SectionHeader } from '@/components/researcher-profile/section-header'
import { DisplayField } from '@/components/researcher-profile/display-field'
import { FormFieldLabel } from '@/components/form-field-label'
import { DEGREE_OPTIONS } from '@/lib/degree-options'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface EducationSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
}

export function EducationSection({ data, refetch }: EducationSectionProps) {
    const { form, isEditing, setIsEditing, defaults, isPending, handleSubmit } = useEducationSection(data, refetch)

    const degreeLabel = defaults.isCurrentlyPursuing ? 'Degree (currently pursuing)' : 'Degree'

    return (
        <Paper p="xl" radius="sm">
            <SectionHeader title="Highest level of education" isEditing={isEditing} onEdit={() => setIsEditing(true)} />

            {isEditing ? (
                <form onSubmit={form.onSubmit(handleSubmit)}>
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
            ) : (
                <Stack gap="sm">
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
            )}
        </Paper>
    )
}
