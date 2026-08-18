'use client'

import { Alert, Button, Checkbox, Group, Stack, Text } from '@mantine/core'
import type { FC } from 'react'
import { BlockingModal } from './blocking-modal'
import { LegalDocumentSection } from './document-sections'
import {
    legalAcknowledgementBody,
    legalAcknowledgementCheckboxLabel,
    legalAcknowledgementTitle,
    type PendingLegalDocument,
} from './acknowledgement-copy'

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
 * Declining is legitimate, so Sign out is the alternative to agreeing. Without it the modal covers
 * the nav and the only way out is closing the tab, which leaves the session intact and puts them
 * straight back here.
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
        <BlockingModal title={legalAcknowledgementTitle(document)}>
            <Stack>
                <Text>{legalAcknowledgementBody(document)}</Text>

                <LegalDocumentSection document={document} />

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
        </BlockingModal>
    )
}
