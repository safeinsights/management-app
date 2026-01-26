'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useForm, zodResolver } from '@/common'
import { Button, Checkbox, Group, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { updateEducationAction } from '@/server/actions/researcher-profile.actions'
import { educationSchema, type EducationValues } from '@/schema/researcher-profile'
import { FormFieldLabel } from '@/components/form-field-label'
import { DEGREE_OPTIONS } from '@/lib/degree-options'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface EducationSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
}

export function EducationSection({ data, refetch }: EducationSectionProps) {
    const [isEditing, setIsEditing] = useState(true)

    const defaults: EducationValues = useMemo(
        () => ({
            educationalInstitution: data?.profile.educationInstitution ?? '',
            degree: data?.profile.educationDegree ?? '',
            fieldOfStudy: data?.profile.educationFieldOfStudy ?? '',
            isCurrentlyPursuing: Boolean(data?.profile.educationIsCurrentlyPursuing ?? false),
        }),
        [
            data?.profile.educationInstitution,
            data?.profile.educationDegree,
            data?.profile.educationFieldOfStudy,
            data?.profile.educationIsCurrentlyPursuing,
        ],
    )

    const form = useForm<EducationValues>({
        mode: 'controlled',
        initialValues: defaults,
        validate: zodResolver(educationSchema),
        validateInputOnBlur: true,
    })

    useEffect(() => {
        form.setValues(defaults)
        form.resetDirty(defaults)
        const complete =
            Boolean(defaults.educationalInstitution) && Boolean(defaults.degree) && Boolean(defaults.fieldOfStudy)
        setIsEditing(!complete)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tie to computed defaults
    }, [defaults.educationalInstitution, defaults.degree, defaults.fieldOfStudy])

    useEffect(() => {
        form.validate()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- run once
    }, [])

    const saveMutation = useMutation({
        mutationFn: async (values: EducationValues) => updateEducationAction(values),
        onSuccess: async (res) => {
            if (res && 'error' in res) {
                notifications.show({ title: 'Save failed', message: String(res.error), color: 'red' })
                return
            }
            await refetch()
            setIsEditing(false)
            notifications.show({ title: 'Saved', message: 'Education updated', color: 'green' })
        },
    })

    return (
        <Paper p="xl" radius="sm">
            <Group justify="space-between" align="center" mb="md">
                <Title order={3}>Highest level of education</Title>
                {!isEditing && (
                    <Button variant="subtle" onClick={() => setIsEditing(true)}>
                        Edit
                    </Button>
                )}
            </Group>

            {isEditing ? (
                <form onSubmit={form.onSubmit((values) => saveMutation.mutate(values))}>
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
                            <Button
                                type="submit"
                                disabled={!form.isValid() || saveMutation.isPending}
                                loading={saveMutation.isPending}
                            >
                                Save changes
                            </Button>
                        </Group>
                    </Stack>
                </form>
            ) : (
                <Stack gap="sm">
                    <div>
                        <Text fw={600} size="sm">
                            Educational institution
                        </Text>
                        <Text>{defaults.educationalInstitution}</Text>
                    </div>
                    <Group grow>
                        <div>
                            <Text fw={600} size="sm">
                                {defaults.isCurrentlyPursuing ? 'Degree (currently pursuing)' : 'Degree'}
                            </Text>
                            <Text>{defaults.degree}</Text>
                        </div>
                        <div>
                            <Text fw={600} size="sm">
                                Field of study
                            </Text>
                            <Text>{defaults.fieldOfStudy}</Text>
                        </div>
                    </Group>
                </Stack>
            )}
        </Paper>
    )
}
