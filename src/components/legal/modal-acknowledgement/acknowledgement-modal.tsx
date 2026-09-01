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

// Not dismissable: dismissing and carrying on is what it exists to prevent, so Sign out is the
// only alternative to agreeing.
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
