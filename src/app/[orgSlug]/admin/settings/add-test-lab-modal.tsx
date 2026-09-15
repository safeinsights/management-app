'use client'

import { useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Group, ScrollArea, Stack, Text, TextInput, Title } from '@mantine/core'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/ssr'
import { AppModal } from '@/components/modals/app-modal'
import { LoadingMessage } from '@/components/loading'
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

    return {
        search,
        setSearch,
        matches,
        selectedIds,
        setSelectedIds,
        selectedLabs: labs.filter((lab) => selectedIds.includes(lab.id)),
        isConfirming,
        startConfirming: () => setIsConfirming(true),
        stopConfirming: () => setIsConfirming(false),
    }
}

type Picker = ReturnType<typeof useTestLabPicker>

function LabOption({ lab }: { lab: EligibleLab }) {
    return <Checkbox value={lab.id} label={lab.name} py={6} />
}

function EmptyLabList({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null

    return (
        <Text fz="sm" c="dimmed" ta="center" p="md">
            No research labs available to add.
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
            {isLoading && <LoadingMessage message="Loading research labs" />}
            <EmptyLabList isVisible={!isLoading && !picker.matches.length} />
            <ScrollArea.Autosize mah={260}>
                <Checkbox.Group value={picker.selectedIds} onChange={picker.setSelectedIds}>
                    {picker.matches.map((lab) => (
                        <LabOption key={lab.id} lab={lab} />
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
                <Button onClick={picker.startConfirming} disabled={!picker.selectedIds.length}>
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
    error: string | null
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
            {error && <Alert color="red">{error}</Alert>}
            <Group justify="flex-end">
                <Button variant="subtle" onClick={picker.stopConfirming} disabled={isSubmitting}>
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
    error: string | null
    onConfirm: (researchLabIds: string[]) => void
}

export function AddTestLabModal({ isOpen, ...body }: Props) {
    return (
        <AppModal isOpen={isOpen} onClose={body.onClose} title="Select Research Lab to add as Test Lab">
            <AddTestLabBody {...body} />
        </AppModal>
    )
}
