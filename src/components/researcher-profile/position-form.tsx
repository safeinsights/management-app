'use client'

import { Button, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import { FormFieldLabel } from '@/components/form-field-label'
import type { PositionValues } from '@/schema/researcher-profile'
import type { UseFormReturnType } from '@mantine/form'

interface PositionFormProps {
    isVisible: boolean
    editingIndex: number
    form: UseFormReturnType<{ positions: PositionValues[] }>
    isAdding: boolean
    hasExistingPositions: boolean
    onSubmit: () => void
}

export function PositionForm({
    isVisible,
    editingIndex,
    form,
    isAdding,
    hasExistingPositions,
    onSubmit,
}: PositionFormProps) {
    if (!isVisible) return null
    const formTitle = isAdding || !hasExistingPositions ? 'Add current position' : 'Edit current position'

    return (
        <form
            id="position-form"
            onSubmit={(e) => {
                e.preventDefault()
                onSubmit()
            }}
        >
            <Title order={5} mb="sm">
                {formTitle}
            </Title>

            <Stack gap="md">
                <div>
                    <FormFieldLabel label="Institutional or organization affiliation" required inputId="affiliation" />
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
                        placeholder="https://university.edu/faculty/yourname"
                        {...form.getInputProps(`positions.${editingIndex}.profileUrl`)}
                    />
                </div>
            </Stack>
        </form>
    )
}

interface PositionFormActionsProps {
    isVisible: boolean
    hasExistingPositions: boolean
    currentEditValid: boolean
    isPending: boolean
    onCancel: () => void
}

function CancelButton({ isVisible, onCancel }: { isVisible: boolean; onCancel: () => void }) {
    if (!isVisible) return null
    return (
        <Button variant="default" onClick={onCancel}>
            Cancel
        </Button>
    )
}

export function PositionFormActions({
    isVisible,
    hasExistingPositions,
    currentEditValid,
    isPending,
    onCancel,
}: PositionFormActionsProps) {
    if (!isVisible) return null

    return (
        <Group justify="flex-end" mt="lg">
            <CancelButton isVisible={hasExistingPositions} onCancel={onCancel} />
            <Button type="submit" form="position-form" disabled={!currentEditValid || isPending} loading={isPending}>
                Save changes
            </Button>
        </Group>
    )
}
