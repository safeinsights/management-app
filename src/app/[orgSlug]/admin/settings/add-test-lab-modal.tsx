'use client'

import { useMemo, useState } from 'react'
import { Button, Checkbox, Group, ScrollArea, Stack, Text, TextInput, Title } from '@mantine/core'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/ssr'
import { AppModal } from '@/components/modals/app-modal'
import { LoadingMessage } from '@/components/loading'
import { ErrorAlert } from '@/components/errors'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'

const PERMANENCE = `Adding a Research Lab as a Test Lab affects future studies only: ${legalDocumentCollectionLabels.SLA} will not be required for studies created from then on. Existing studies still require ${legalDocumentCollectionLabels.SLA}, and a Test Lab cannot be removed.`

export type EligibleLab = { id: string; name: string }

const useTestLabPicker = (labs: EligibleLab[]) => {
    const [search, setSearch] = useState('')
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [isConfirming, setIsConfirming] = useState(false)

    const matches = useMemo(() => {
        const needle = search.trim().toLowerCase()
        return needle ? labs.filter((lab) => lab.name.toLowerCase().includes(needle)) : labs
    }, [labs, search])

    const selectedLabs = useMemo(() => {
        const chosen = new Set(selectedIds)
        return labs.filter((lab) => chosen.has(lab.id))
    }, [labs, selectedIds])

    return {
        search,
        setSearch,
        matches,
        selectedIds,
        setSelectedIds,
        selectedLabs,
        isConfirming,
        goToConfirm: () => setIsConfirming(true),
        goBack: () => setIsConfirming(false),
    }
}

type Picker = ReturnType<typeof useTestLabPicker>

// Nothing to add and nothing matched read the same to a reader mid-search; they are not.
function NoMatches({ isVisible, isSearching }: { isVisible: boolean; isSearching: boolean }) {
    const message = isSearching ? 'No research labs match that search.' : 'No research labs available to add.'

    if (!isVisible) return null

    return (
        <Text fz="sm" c="dimmed" ta="center" p="md">
            {message}
        </Text>
    )
}

type PickerStepProps = { isVisible: boolean; picker: Picker; isLoading: boolean; onCancel: () => void }

function PickerStep({ isVisible, picker, isLoading, onCancel }: PickerStepProps) {
    if (!isVisible) return null

    return (
        <Stack>
            <TextInput
                value={picker.search}
                onChange={(event) => picker.setSearch(event.currentTarget.value)}
                placeholder="Search research labs"
                aria-label="Search research labs"
                leftSection={<MagnifyingGlassIcon size={16} />}
            />
            <LoadingMessage isVisible={isLoading} message="Loading research labs" />
            <NoMatches isVisible={!isLoading && !picker.matches.length} isSearching={Boolean(picker.search.trim())} />
            <ScrollArea.Autosize mah={260}>
                <Checkbox.Group value={picker.selectedIds} onChange={picker.setSelectedIds}>
                    {picker.matches.map((lab) => (
                        <Checkbox key={lab.id} value={lab.id} label={lab.name} py={6} />
                    ))}
                </Checkbox.Group>
            </ScrollArea.Autosize>
            <Text size="sm" c="dimmed">
                {PERMANENCE}
            </Text>
            <Group justify="flex-end">
                <Button variant="subtle" onClick={onCancel}>
                    Cancel
                </Button>
                <Button onClick={picker.goToConfirm} disabled={!picker.selectedIds.length}>
                    Add
                </Button>
            </Group>
        </Stack>
    )
}

type ConfirmStepProps = {
    isVisible: boolean
    picker: Picker
    isSubmitting: boolean
    error: unknown
    onConfirm: (researchLabIds: string[]) => void
}

function ConfirmStep({ isVisible, picker, isSubmitting, error, onConfirm }: ConfirmStepProps) {
    if (!isVisible) return null

    return (
        <Stack>
            <Title order={4} size="h5">
                Add these labs as Test Labs?
            </Title>
            <Text>{PERMANENCE}</Text>
            <Stack gap={2}>
                {picker.selectedLabs.map((lab) => (
                    <Text key={lab.id} fw={500}>
                        {lab.name}
                    </Text>
                ))}
            </Stack>
            <ErrorAlert error={error} title="Failed to add test labs" />
            <Group justify="flex-end">
                <Button variant="subtle" onClick={picker.goBack} disabled={isSubmitting}>
                    Back
                </Button>
                <Button onClick={() => onConfirm(picker.selectedIds)} loading={isSubmitting}>
                    Add
                </Button>
            </Group>
        </Stack>
    )
}

type BodyProps = Omit<Props, 'isOpen'>

// Holds the step and selection. AppModal does not keepMounted, so closing unmounts this and the
// next open starts on the picker — a successful add closes from the mutation, never through Cancel.
function AddTestLabBody({ onClose, labs, isLoading, isSubmitting, error, onConfirm }: BodyProps) {
    const picker = useTestLabPicker(labs)

    return (
        <>
            <PickerStep isVisible={!picker.isConfirming} picker={picker} isLoading={isLoading} onCancel={onClose} />
            <ConfirmStep
                isVisible={picker.isConfirming}
                picker={picker}
                isSubmitting={isSubmitting}
                error={error}
                onConfirm={onConfirm}
            />
        </>
    )
}

type Props = {
    isOpen: boolean
    onClose: () => void
    labs: EligibleLab[]
    isLoading: boolean
    isSubmitting: boolean
    error: unknown
    onConfirm: (researchLabIds: string[]) => void
}

export function AddTestLabModal({ isOpen, ...body }: Props) {
    return (
        <AppModal isOpen={isOpen} onClose={body.onClose} title="Select Research Lab to add as Test Lab">
            <AddTestLabBody {...body} />
        </AppModal>
    )
}
