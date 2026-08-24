'use client'

import { Alert, Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core'
import type { FC } from 'react'
import { LegalMarkdownSection } from '../markdown-sections'
import {
    legalAcknowledgementBody,
    legalAcknowledgementCheckboxLabel,
    legalAcknowledgementTitle,
} from './acknowledgement-copy'
import type { PendingLegalDocument } from '@/schema/legal-document'

type Props = {
    isVisible: boolean
    document?: PendingLegalDocument | null
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
 * Blocks the app until the user acknowledges the document they owe.
 *
 * One document per modal: acknowledging refetches what is outstanding, so a user owing both the Terms
 * of Service and the Privacy Notice is asked about the second once the first is recorded.
 *
 * Deliberately not dismissable — no close button, no escape, no click-outside — because dismissing
 * it and carrying on is the thing it exists to prevent. Declining is still a legitimate choice, so
 * Sign out is offered as the alternative to agreeing; without it the modal covers the nav and the
 * only way out is closing the tab, which leaves the session intact and puts them straight back here.
 */
export const LegalAcknowledgementModal: FC<Props> = ({
    isVisible,
    document,
    isChecked,
    onCheckedChange,
    onContinue,
    onSignOut,
    isSubmitting,
    error,
}) => {
    if (!isVisible || !document) return null

    return (
        <Modal
            opened
            onClose={() => {}}
            title={legalAcknowledgementTitle(document)}
            size="lg"
            centered
            withCloseButton={false}
            closeOnEscape={false}
            closeOnClickOutside={false}
        >
            <Stack>
                <Text>{legalAcknowledgementBody(document)}</Text>

                <LegalMarkdownSection document={document} />

                <Checkbox
                    checked={isChecked}
                    onChange={(event) => onCheckedChange(event.currentTarget.checked)}
                    label={legalAcknowledgementCheckboxLabel(document)}
                />

                <AcknowledgementError error={error} />

                <Group justify="flex-end">
                    <Button variant="subtle" onClick={onSignOut} disabled={isSubmitting}>
                        Sign out
                    </Button>
                    {/* Mantine's `loading` blocks pointer clicks but leaves the button keyboard-focusable. */}
                    <Button onClick={onContinue} disabled={!isChecked || isSubmitting} loading={isSubmitting}>
                        Continue
                    </Button>
                </Group>
            </Stack>
        </Modal>
    )
}
