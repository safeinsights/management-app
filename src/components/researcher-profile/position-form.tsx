'use client'

import { Anchor, Box, Button, Group, Stack, Text, TextInput, Title } from '@mantine/core'
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
        <>
            <Title order={5} mb="sm">
                {formTitle}
            </Title>

            <form
                id="position-form"
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
                            placeholder="https://university.edu/faculty/yourname"
                            {...form.getInputProps(`positions.${editingIndex}.profileUrl`)}
                        />
                    </div>
                </Stack>
            </form>
        </>
    )
}

interface PositionFormActionsProps {
    isVisible: boolean
    hasExistingPositions: boolean
    isAdding: boolean
    currentEditValid: boolean
    isPending: boolean
    onCancel: () => void
    onAdd: () => void
}

function AddAnotherLink({ isVisible, onAdd }: { isVisible: boolean; onAdd: () => void }) {
    if (!isVisible) return null
    return (
        <Box>
            <Anchor component="button" onClick={onAdd}>
                + Add another current position
            </Anchor>
        </Box>
    )
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
    isAdding,
    currentEditValid,
    isPending,
    onCancel,
    onAdd,
}: PositionFormActionsProps) {
    if (!isVisible) return null

    return (
        <>
            <AddAnotherLink isVisible={hasExistingPositions && !isAdding} onAdd={onAdd} />

            <Group justify="flex-end" mt="sm">
                <CancelButton isVisible={hasExistingPositions} onCancel={onCancel} />
                <Button
                    type="submit"
                    form="position-form"
                    disabled={!currentEditValid || isPending}
                    loading={isPending}
                >
                    Save changes
                </Button>
            </Group>
        </>
    )
}
