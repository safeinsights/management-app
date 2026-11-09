'use client'

import { Button, Checkbox, Group, Stack, Text, VisuallyHidden } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import type { FC } from 'react'
import { LinkWithIcon } from '@/components/links'
import { Routes } from '@/lib/routes'
import { legalDocumentTypeLabels, type PendingGlobalAcknowledgement } from '@/schema/legal-document'
import { fontWeight } from '@/theme/tokens'
import { AcknowledgementError, BlockingModal } from '../blocking-modal'

type Props = {
    isVisible: boolean
    documents: PendingGlobalAcknowledgement[]
    isChecked: boolean
    onCheckedChange: (checked: boolean) => void
    onContinue: () => void
    isSubmitting: boolean
    error: string | null
}

const documentNames = (documents: PendingGlobalAcknowledgement[]) =>
    documents.map((document) => legalDocumentTypeLabels[document.type]).join(' and ')

// "Updated" only when it is true of every document asked about; a first publish keeps the older
// "now available" wording.
const isUpdateOfAll = (documents: PendingGlobalAcknowledgement[]) => documents.every((document) => document.isUpdate)

// A new tab, so reading the document does not lose the gate the user is answering.
const DocumentLink: FC<{ document: PendingGlobalAcknowledgement }> = ({ document }) => (
    <LinkWithIcon
        href={`${Routes.legal}?tab=${document.type}`}
        target="_blank"
        rel="noopener"
        fz="md"
        underline="always"
        icon={<ArrowSquareOutIcon size={16} />}
    >
        {legalDocumentTypeLabels[document.type]}
        <VisuallyHidden component="span"> (opens in a new tab)</VisuallyHidden>
    </LinkWithIcon>
)

const DocumentLinks: FC<{ documents: PendingGlobalAcknowledgement[] }> = ({ documents }) =>
    documents.map((document, index) => (
        <span key={document.versionId}>
            {index > 0 ? ' and ' : null}
            <DocumentLink document={document} />
        </span>
    ))

const globalAcknowledgementBody = (documents: PendingGlobalAcknowledgement[]) => {
    const links = <DocumentLinks documents={documents} />
    if (isUpdateOfAll(documents)) return <>We have updated our {links}. Please review before proceeding.</>

    const verb = documents.length > 1 ? 'are' : 'is'
    return (
        <>
            The {links} {verb} now available. Please review before proceeding.
        </>
    )
}

const globalAcknowledgementCheckboxLabel = (documents: PendingGlobalAcknowledgement[]) => {
    const updated = isUpdateOfAll(documents) ? 'updated ' : ''

    return `I have read and agree to the ${updated}${documentNames(documents)}.`
}

// The Terms of Service and Privacy Notice gate. It asks once for every outstanding one and links to
// each rather than embedding it. Not dismissable, and with no Sign out, per the UX review.
export const GlobalAcknowledgementModal: FC<Props> = ({
    isVisible,
    documents,
    isChecked,
    onCheckedChange,
    onContinue,
    isSubmitting,
    error,
}) => {
    if (!isVisible || !documents.length) return null

    return (
        <BlockingModal
            size={511}
            title={
                <Text span fz="h3" fw={fontWeight.bold}>
                    Welcome to SafeInsights!
                </Text>
            }
        >
            <Stack>
                <Text fz="md">{globalAcknowledgementBody(documents)}</Text>

                <Checkbox
                    checked={isChecked}
                    onChange={(event) => onCheckedChange(event.currentTarget.checked)}
                    label={
                        <Text span fz="sm" fw={fontWeight.semibold}>
                            {globalAcknowledgementCheckboxLabel(documents)}
                        </Text>
                    }
                />

                <AcknowledgementError error={error} />

                <Group>
                    {/* Mantine's `loading` blocks pointer clicks but leaves the button keyboard-focusable. */}
                    <Button onClick={onContinue} disabled={!isChecked || isSubmitting} loading={isSubmitting}>
                        Continue
                    </Button>
                </Group>
            </Stack>
        </BlockingModal>
    )
}
