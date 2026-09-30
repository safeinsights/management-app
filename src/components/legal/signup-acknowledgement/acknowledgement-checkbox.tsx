'use client'

import { type GlobalLegalDocument, legalDocumentTypeLabels } from '@/schema/legal-document'
import { Checkbox, Stack } from '@mantine/core'
import { FC, ReactNode, useId } from 'react'
import { LegalMarkdownSections } from '../markdown-sections'
import { PdfLink } from '../pdf-link'
import { ParticipationData } from '@/server/actions/legal-document.actions'
import { PlaceholderLabel } from './placeholder-tos-pn'

type AcknowledgeProps = {
    label: string | ReactNode
    checked: boolean
    onChange: (checked: boolean) => void
    /** Fires when the box loses focus, so leaving it unchecked can be flagged (OTTER-647). */
    onBlur?: () => void
    error?: ReactNode
}

export const TosPnPreview: FC<{ documents: GlobalLegalDocument[] }> = ({ documents }) => (
    <Stack gap="sm" mt="md">
        <LegalMarkdownSections documents={documents} labelSize="sm" />
    </Stack>
)

export const globalDocAgreementLabel = (documents: GlobalLegalDocument[]) => {
    if (documents.length === 0) {
        return <PlaceholderLabel />
    }
    return `I agree to the ${documents.map((document) => legalDocumentTypeLabels[document.type]).join(' and ')}`
}

export const participationAgreementLabel = (document: ParticipationData | null) => {
    if (!document) return null
    return (
        <>
            I agree to the <PdfLink url={document.url} label={legalDocumentTypeLabels[document.type]} />
        </>
    )
}

export const AcknowledgementCheckbox: FC<AcknowledgeProps> = ({ label, checked, onChange, onBlur, error }) => {
    const errorId = useId()
    if (!label) return null

    return (
        <Checkbox
            checked={checked}
            onChange={(event) => onChange(event.currentTarget.checked)}
            onBlur={onBlur}
            label={label}
            // Nicely pass error as span for Mantine formatting reasons
            error={error ? <span id={errorId}>{error}</span> : undefined}
            // Hand-wire `aria-invalid` and `aria-describedby` errors for accessibility
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
        />
    )
}
