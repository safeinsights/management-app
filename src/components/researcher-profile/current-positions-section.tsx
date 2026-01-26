'use client'

import { useMemo, useState } from 'react'
import { useMutation, useForm, zodResolver } from '@/common'
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Divider,
    Group,
    Paper,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { updateCurrentPositionsAction } from '@/server/actions/researcher-profile.actions'
import { currentPositionSchema, type CurrentPositionValues } from '@/schema/researcher-profile'
import { FormFieldLabel } from '@/components/form-field-label'
import { PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface CurrentPositionsSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
}

export function CurrentPositionsSection({ data, refetch }: CurrentPositionsSectionProps) {
    const [editingIndex, setEditingIndex] = useState<number | null>(null)
    const [isAdding, setIsAdding] = useState(false)

    const positions: CurrentPositionValues[] = useMemo(() => {
        const raw = (data?.profile.currentPositions ?? []) as unknown
        if (Array.isArray(raw)) {
            return raw
                .map((p) => {
                    const obj = p as Record<string, unknown>
                    return {
                        affiliation: String(obj.affiliation ?? ''),
                        position: String(obj.position ?? ''),
                        profileUrl: (obj.profileUrl ? String(obj.profileUrl) : undefined) as string | undefined,
                    }
                })
                .filter((p) => p.affiliation || p.position || p.profileUrl)
        }
        return []
    }, [data?.profile.currentPositions])

    const form = useForm<CurrentPositionValues>({
        mode: 'controlled',
        initialValues: { affiliation: '', position: '', profileUrl: '' },
        validate: zodResolver(currentPositionSchema),
        validateInputOnBlur: true,
    })

    const saveMutation = useMutation({
        mutationFn: async (positionsToSave: CurrentPositionValues[]) =>
            updateCurrentPositionsAction({ positions: positionsToSave }),
        onSuccess: async (res) => {
            if (res && 'error' in res) {
                notifications.show({ title: 'Save failed', message: String(res.error), color: 'red' })
                return
            }
            await refetch()
            setEditingIndex(null)
            setIsAdding(false)
            notifications.show({ title: 'Saved', message: 'Current institutional information updated', color: 'green' })
        },
    })

    const openEdit = (index: number) => {
        setEditingIndex(index)
        setIsAdding(false)
        const pos = positions[index]
        form.setValues({
            affiliation: pos?.affiliation ?? '',
            position: pos?.position ?? '',
            profileUrl: pos?.profileUrl ?? '',
        })
        form.resetDirty()
    }

    const openAdd = () => {
        setIsAdding(true)
        setEditingIndex(null)
        form.setValues({ affiliation: '', position: '', profileUrl: '' })
        form.resetDirty()
        form.validate()
    }

    const cancelEdit = () => {
        if (positions.length === 0) {
            openAdd()
            return
        }
        setEditingIndex(null)
        setIsAdding(false)
        form.reset()
    }

    const handleSubmit = (values: CurrentPositionValues) => {
        const cleaned: CurrentPositionValues = {
            affiliation: values.affiliation,
            position: values.position,
            profileUrl: values.profileUrl?.trim() ? values.profileUrl.trim() : undefined,
        }
        const next = [...positions]
        if (isAdding) {
            next.push(cleaned)
        } else if (editingIndex !== null) {
            next[editingIndex] = cleaned
        }
        saveMutation.mutate(next)
    }

    const handleDelete = (index: number) => {
        if (positions.length < 2) return
        const next = positions.filter((_, i) => i !== index)
        saveMutation.mutate(next)
    }

    const showForm = editingIndex !== null || isAdding || positions.length === 0

    return (
        <Paper p="xl" radius="sm">
            <Group justify="space-between" align="center" mb="md">
                <Title order={3}>Current institutional information</Title>
            </Group>

            {positions.length > 0 && (
                <>
                    <Table withTableBorder withColumnBorders>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Institutional affiliation</Table.Th>
                                <Table.Th>Position</Table.Th>
                                <Table.Th>Profile page</Table.Th>
                                <Table.Th w={80} ta="center">
                                    Edit
                                </Table.Th>
                                {positions.length >= 2 && (
                                    <Table.Th w={80} ta="center">
                                        Delete
                                    </Table.Th>
                                )}
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {positions.map((pos, idx) => (
                                <Table.Tr key={idx}>
                                    <Table.Td>{pos.affiliation}</Table.Td>
                                    <Table.Td>{pos.position}</Table.Td>
                                    <Table.Td>
                                        {pos.profileUrl ? (
                                            <Anchor href={pos.profileUrl} target="_blank">
                                                {pos.profileUrl}
                                            </Anchor>
                                        ) : null}
                                    </Table.Td>
                                    <Table.Td ta="center">
                                        <ActionIcon
                                            variant="subtle"
                                            onClick={() => openEdit(idx)}
                                            aria-label="Edit current position"
                                        >
                                            <PencilSimpleIcon />
                                        </ActionIcon>
                                    </Table.Td>
                                    {positions.length >= 2 && (
                                        <Table.Td ta="center">
                                            <ActionIcon
                                                variant="subtle"
                                                color="red"
                                                disabled={positions.length < 2}
                                                onClick={() => handleDelete(idx)}
                                                aria-label="Delete current position"
                                            >
                                                <TrashIcon />
                                            </ActionIcon>
                                        </Table.Td>
                                    )}
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>

                    <Box mt="md">
                        <Anchor component="button" onClick={openAdd}>
                            + Add another current position
                        </Anchor>
                    </Box>
                </>
            )}

            {showForm && (
                <Box mt={positions.length > 0 ? 'lg' : undefined}>
                    {positions.length > 0 && <Divider my="md" />}
                    <Title order={5} mb="sm">
                        {isAdding || positions.length === 0 ? 'Add current position' : 'Edit current position'}
                    </Title>

                    <form onSubmit={form.onSubmit(handleSubmit)}>
                        <Stack gap="md">
                            <div>
                                <FormFieldLabel
                                    label="Institutional or organization affiliation"
                                    required
                                    inputId="affiliation"
                                />
                                <Text size="sm" mb={6}>
                                    State your current institutional or organizational affiliation. If you are a
                                    student, please specify your current educational institution.
                                </Text>
                                <TextInput
                                    id="affiliation"
                                    placeholder="Ex: University of California, Berkeley"
                                    {...form.getInputProps('affiliation')}
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
                                    {...form.getInputProps('position')}
                                />
                            </div>
                            <div>
                                <FormFieldLabel label="Link to your profile page" inputId="profileUrl" />
                                <Text size="sm" mb={6}>
                                    Add a link to your personal institutional or organization&apos;s profile page, if
                                    available.
                                </Text>
                                <TextInput
                                    id="profileUrl"
                                    placeholder="https://university.edu/student/yourname"
                                    {...form.getInputProps('profileUrl')}
                                />
                            </div>

                            <Group justify="flex-end" mt="sm">
                                <Button variant="default" onClick={cancelEdit}>
                                    Cancel
                                </Button>
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
                </Box>
            )}
        </Paper>
    )
}
