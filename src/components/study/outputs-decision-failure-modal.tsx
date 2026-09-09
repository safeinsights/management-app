'use client'

import { FC } from 'react'
import { Button, Group, Stack, Text } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'

export const FAILURE_TITLE = 'Decision could not be submitted'

// The card specifies this sentence, and it is shown only when the feedback is provably in the
// database. Every other wording below exists so the modal never claims a save it cannot back.
export const SAVED_BODY = 'Your work is saved. Try again.'
export const UNSAVED_BODY = 'We could not save your work. Keep this tab open and try again.'
export const RELOAD_HINT = 'The page needs to reload first. You will be asked for your security key again.'
export const UNSAVED_RELOAD_BODY = 'We could not save your work. Copy your feedback somewhere safe before reloading.'
export const UNCONFIRMED_BODY = 'Try again.'
export const UNCONFIRMED_RELOAD_BODY =
    'The page needs to reload first. You will be asked for your security key again. Your feedback is stored as you ' +
    'type, but we could not confirm it just now, so copy anything you would not want to retype.'

// `saved` is null when the editor has never reported a completed write, which almost always means a
// build that does not report them. Neither promising nor denying a save is the only honest option.
export type OutputsDecisionFailure = { cause: 'retry' | 'stale'; saved: boolean | null }

type Props = {
    failure: OutputsDecisionFailure | null
    onDismiss: () => void
    onReload: () => void
}

const retryBody = (saved: boolean | null) => {
    if (saved === true) return SAVED_BODY
    if (saved === false) return UNSAVED_BODY
    return UNCONFIRMED_BODY
}

const staleBody = (saved: boolean | null) => {
    if (saved === true) return `${SAVED_BODY} ${RELOAD_HINT}`
    if (saved === false) return UNSAVED_RELOAD_BODY
    return UNCONFIRMED_RELOAD_BODY
}

const RetryOnlyActions: FC<{ onDismiss: () => void }> = ({ onDismiss }) => (
    <Group>
        <Button onClick={onDismiss}>Try again</Button>
    </Group>
)

const ReloadActions: FC<{ label: string; onReload: () => void; onDismiss: () => void }> = ({
    label,
    onReload,
    onDismiss,
}) => (
    <Group>
        <Button variant="outline" onClick={onDismiss}>
            Cancel
        </Button>
        <Button onClick={onReload}>{label}</Button>
    </Group>
)

const FailureActions: FC<{
    isStale: boolean
    saved: boolean | null
    onDismiss: () => void
    onReload: () => void
}> = ({ isStale, saved, onDismiss, onReload }) => {
    if (!isStale) return <RetryOnlyActions onDismiss={onDismiss} />
    // A confirmed save can promise the retry; anything less only offers the reload.
    const label = saved === true ? 'Try again' : 'Reload anyway'
    return <ReloadActions label={label} onReload={onReload} onDismiss={onDismiss} />
}

// Stays mounted while closed so AppModal keeps the focus-return it owns, matching
// SubmitOutputsDecisionModal.
export const OutputsDecisionFailureModal: FC<Props> = ({ failure, onDismiss, onReload }) => {
    const isStale = failure?.cause === 'stale'
    const saved = failure?.saved ?? null
    const body = isStale ? staleBody(saved) : retryBody(saved)

    return (
        <AppModal isOpen={failure !== null} onClose={onDismiss} title={FAILURE_TITLE}>
            <Stack gap="xl">
                <Text size="md">{body}</Text>
                <FailureActions isStale={isStale} saved={saved} onDismiss={onDismiss} onReload={onReload} />
            </Stack>
        </AppModal>
    )
}
