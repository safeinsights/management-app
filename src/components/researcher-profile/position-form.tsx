'use client'

import { Box, Button, Divider, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import { FormFieldLabel } from '@/components/form-field-label'
import type { CurrentPositionValues } from '@/schema/researcher-profile'
import type { UseFormReturnType } from '@mantine/form'

interface PositionFormProps {
    editingIndex: number
    form: UseFormReturnType<{ positions: CurrentPositionValues[] }>
    isAdding: boolean
    hasExistingPositions: boolean
    currentEditValid: boolean
    isPending: boolean
    onSubmit: () => void
    onCancel: () => void
}

export function PositionForm({
    editingIndex,
    form,
    isAdding,
    hasExistingPositions,
    currentEditValid,
    isPending,
    onSubmit,
    onCancel,
}: PositionFormProps) {
    const formTitle = isAdding || !hasExistingPositions ? 'Add current position' : 'Edit current position'

    return (
        <Box mt={hasExistingPositions ? 'lg' : undefined}>
            {hasExistingPositions && <Divider my="md" />}
            <Title order={5} mb="sm">
                {formTitle}
            </Title>

            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    onSubmit()
                }}
            >
                <Stack gap="md">
                    <div>
                        <FormFieldLabel
                            label="Institutional or organization affiliation"
                            required
                            inputId="affiliation"
                        />
                        <Text size="sm" mb={6}>
                            State your current institutional or organizational affiliation. If you are a student, please
                            specify your current educational institution.
                        </Text>
                        <TextInput
                            id="affiliation"
                            placeholder="Ex: University of California, Berkeley"
                            {...form.getInputProps(`positions.${editingIndex}.affiliation`)}
                        />
                    </div>
                    <div>
                        <FormFieldLabel label="Position" required inputId="position" />
                        <Text size="sm" mb={6}>
                            Your current position at this organization or institution.
                        </Text>
                        <TextInput
                            id="position"
                            placeholder="Ex: Senior Researcher"
                            {...form.getInputProps(`positions.${editingIndex}.position`)}
                        />
                    </div>
                    <div>
                        <FormFieldLabel label="Link to your profile page" inputId="profileUrl" />
                        <Text size="sm" mb={6}>
                            Add a link to your personal institutional or organization&apos;s profile page, if available.
                        </Text>
                        <TextInput
                            id="profileUrl"
                            placeholder="https://university.edu/student/yourname"
                            {...form.getInputProps(`positions.${editingIndex}.profileUrl`)}
                        />
                    </div>

                    <Group justify="flex-end" mt="sm">
                        <Button variant="default" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!currentEditValid || isPending} loading={isPending}>
                            Save changes
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Box>
    )
}
