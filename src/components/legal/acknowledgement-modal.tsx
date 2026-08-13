'use client'

import { Alert, Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core'
import type { FC } from 'react'
import { LegalDocumentSections } from './document-sections'
import {
    legalAcknowledgementBody,
    legalAcknowledgementCheckboxLabel,
    legalAcknowledgementTitle,
    type PendingLegalDocument,
} from './acknowledgement-copy'

type Props = {
    isVisible: boolean
    documents: PendingLegalDocument[]
    isChecked: boolean
    onCheckedChange: (checked: boolean) => void
    onContinue: () => void
    onSignOut: () => void
    isSubmitting: boolean
    error: string | null
}

const AcknowledgementError: FC<{ error: string | null }> = ({ error }) => {
    if (!error) return null

    return <Alert color="red">{error}</Alert>
}

/**
 * Blocks the app until the user acknowledges the documents they owe.
 *
 * Deliberately not dismissable — no close button, no escape, no click-outside — because dismissing
 * it and carrying on is the thing it exists to prevent. Declining is still a legitimate choice, so
 * Sign out is offered as the alternative to agreeing; without it the modal covers the nav and the
 * only way out is closing the tab, which leaves the session intact and puts them straight back here.
 */
export const LegalAcknowledgementModal: FC<Props> = ({
    isVisible,
    documents,
    isChecked,
    onCheckedChange,
    onContinue,
    onSignOut,
    isSubmitting,
    error,
}) => {
    if (!isVisible) return null

    return (
        <Modal
            opened
            onClose={() => {}}
            title={legalAcknowledgementTitle(documents)}
            size="lg"
            centered
            withCloseButton={false}
            closeOnEscape={false}
            closeOnClickOutside={false}
        >
            <Stack>
                <Text>{legalAcknowledgementBody(documents)}</Text>

                <LegalDocumentSections documents={documents} />

                <Checkbox
                    checked={isChecked}
                    onChange={(event) => onCheckedChange(event.currentTarget.checked)}
                    label={legalAcknowledgementCheckboxLabel(documents)}
                />

                <AcknowledgementError error={error} />

                <Group justify="flex-end">
                    <Button variant="subtle" onClick={onSignOut} disabled={isSubmitting}>
                        Sign out
                    </Button>
                    <Button onClick={onContinue} disabled={!isChecked} loading={isSubmitting}>
                        Continue
                    </Button>
                </Group>
            </Stack>
        </Modal>
    )
}
