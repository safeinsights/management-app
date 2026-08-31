'use client'

import { type GlobalLegalDocument, legalDocumentTypeLabels } from '@/schema/legal-document'
import { Checkbox, Stack } from '@mantine/core'
import { FC, ReactNode } from 'react'
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

const TERMS_ERROR_ID = 'terms-accepted-error'

// A standalone Mantine `Checkbox` uses `error` for styling only: it renders the message but adds
// neither `aria-invalid` nor `aria-describedby`, unlike the inputs built on `Input.Wrapper`. Both
// are wired by hand here so the requirement is not conveyed by red text alone.
export const AcknowledgementCheckbox: FC<AcknowledgeProps> = ({ label, checked, onChange, onBlur, error }) => {
    if (!label) return null

    return (
        <Checkbox
            checked={checked}
            onChange={(event) => onChange(event.currentTarget.checked)}
            onBlur={onBlur}
            label={label}
            // The id rides on this span rather than an `errorProps`, which a standalone Checkbox does
            // not accept. A span, because Mantine renders the error inside a `<p>`.
            error={error ? <span id={TERMS_ERROR_ID}>{error}</span> : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? TERMS_ERROR_ID : undefined}
        />
    )
}
