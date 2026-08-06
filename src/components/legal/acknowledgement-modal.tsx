'use client'

import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { Alert, Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core'
import type { FC } from 'react'
import { LegalDocumentContent } from './document-content'
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

const DocumentSections: FC<{ documents: PendingLegalDocument[] }> = ({ documents }) => (
    <>
        {documents.map((document) => (
            <Stack key={document.versionId} gap="xs">
                <Text fw={600}>{legalDocumentTypeLabels[document.type]}</Text>
                <LegalDocumentContent content={document.content} label={legalDocumentTypeLabels[document.type]} />
            </Stack>
        ))}
    </>
)

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

                <DocumentSections documents={documents} />

                <Checkbox
                    checked={isChecked}
                    onChange={(event) => onCheckedChange(event.currentTarget.checked)}
                    label={legalAcknowledgementCheckboxLabel(documents)}
                />

                <Alert color="red" hidden={!error}>
                    {error}
                </Alert>

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
