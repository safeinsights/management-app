'use client'

import { useId, useMemo, useState } from 'react'
import { Alert, Button, Group, Loader, MultiSelect, Stack, Text, Title, Tooltip, VisuallyHidden } from '@mantine/core'
import { CaretUpDownIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { AppModal } from '@/components/modals/app-modal'
import { ErrorAlert } from '@/components/errors'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'
import { fontWeight } from '@/theme/tokens'

const SELECTION_REQUIRED = 'Select at least one Research Lab to continue'
const SUBMIT_LABEL = 'Add as Test Lab'
const TOOLTIP_EVENTS = { hover: true, focus: true, touch: false }

export type EligibleLab = { id: string; name: string }

const useTestLabPicker = (labs: EligibleLab[]) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [isConfirming, setIsConfirming] = useState(false)

    const options = useMemo(() => labs.map((lab) => ({ value: lab.id, label: lab.name })), [labs])

    const selectedLabs = useMemo(() => {
        const chosen = new Set(selectedIds)
        return labs.filter((lab) => chosen.has(lab.id))
    }, [labs, selectedIds])

    const hasSelection = selectedIds.length > 0

    // The button is only styled disabled, so it stays focusable for its tooltip; this is the guard.
    const goToConfirm = () => {
        if (hasSelection) setIsConfirming(true)
    }

    return {
        options,
        selectedIds,
        setSelectedIds,
        selectedLabs,
        hasSelection,
        isConfirming,
        goToConfirm,
        goBack: () => setIsConfirming(false),
    }
}

type Picker = ReturnType<typeof useTestLabPicker>

function IrreversibleWarning() {
    return (
        <Alert variant="light" color="yellow" icon={<WarningCircleIcon weight="fill" />}>
            This selection cannot be reversed and will not affect existing studies.
        </Alert>
    )
}

function placeholderFor(picker: Picker, isLoading: boolean) {
    if (picker.hasSelection) return undefined
    if (!isLoading && !picker.options.length) return 'No Research Labs available to add'
    return 'Select one or more Research Labs'
}

function LabSelect({ picker, isLoading }: { picker: Picker; isLoading: boolean }) {
    const placeholder = placeholderFor(picker, isLoading)
    const isDisabled = isLoading || !picker.options.length
    const rightSection = isLoading ? <Loader size="xs" /> : <CaretUpDownIcon size={18} />

    return (
        <MultiSelect
            aria-label="Research Labs"
            data={picker.options}
            value={picker.selectedIds}
            onChange={picker.setSelectedIds}
            placeholder={placeholder}
            disabled={isDisabled}
            searchable
            nothingFoundMessage="Nothing found"
            rightSection={rightSection}
            rightSectionPointerEvents="none"
        />
    )
}

// Tooltip content is not in the DOM until it opens, so screen readers get the reason from here.
function SelectionHint({ id, isVisible }: { id: string; isVisible: boolean }) {
    if (!isVisible) return null

    return <VisuallyHidden id={id}>{SELECTION_REQUIRED}</VisuallyHidden>
}

// A native `disabled` swallows pointer and focus events, so the tooltip would never open.
function ContinueButton({ picker }: { picker: Picker }) {
    const hintId = useId()
    const isBlocked = !picker.hasSelection
    const describedBy = isBlocked ? hintId : undefined
    const dataDisabled = isBlocked || undefined

    return (
        <>
            <Tooltip
                label={SELECTION_REQUIRED}
                events={TOOLTIP_EVENTS}
                disabled={picker.hasSelection}
                position="bottom"
                withArrow
            >
                <Button
                    onClick={picker.goToConfirm}
                    data-disabled={dataDisabled}
                    aria-disabled={isBlocked}
                    aria-describedby={describedBy}
                >
                    {SUBMIT_LABEL}
                </Button>
            </Tooltip>
            <SelectionHint id={hintId} isVisible={isBlocked} />
        </>
    )
}

type PickerStepProps = { isVisible: boolean; picker: Picker; isLoading: boolean; onCancel: () => void }

function PickerStep({ isVisible, picker, isLoading, onCancel }: PickerStepProps) {
    if (!isVisible) return null

    return (
        <Stack>
            <LabSelect picker={picker} isLoading={isLoading} />
            <Text size="sm">
                New studies submitted to you from your Test Labs will not require {legalDocumentCollectionLabels.SLA}.
            </Text>
            <IrreversibleWarning />
            <Group justify="flex-end">
                <Button variant="subtle" onClick={onCancel}>
                    Cancel
                </Button>
                <ContinueButton picker={picker} />
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
            <Stack gap="xxs">
                {picker.selectedLabs.map((lab) => (
                    <Text key={lab.id} fw={fontWeight.semibold}>
                        {lab.name}
                    </Text>
                ))}
            </Stack>
            <IrreversibleWarning />
            <ErrorAlert error={error} title="Failed to add test labs" />
            <Group justify="flex-end">
                <Button variant="subtle" onClick={picker.goBack} disabled={isSubmitting}>
                    Back
                </Button>
                <Button onClick={() => onConfirm(picker.selectedIds)} loading={isSubmitting}>
                    {SUBMIT_LABEL}
                </Button>
            </Group>
        </Stack>
    )
}

type BodyProps = Omit<Props, 'isOpen'>

// AppModal unmounts on close, so a close from the mutation still reopens on an empty picker.
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
        <AppModal isOpen={isOpen} onClose={body.onClose} title="Select Research Labs to add as Test Labs">
            <AddTestLabBody {...body} />
        </AppModal>
    )
}
