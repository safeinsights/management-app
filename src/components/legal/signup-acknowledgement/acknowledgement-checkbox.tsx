'use client'

import { type GlobalLegalDocument, legalDocumentTypeLabels } from '@/schema/legal-document'
import { Stack } from '@mantine/core'
import { FC } from 'react'
import { LegalMarkdownSections } from '../markdown-sections'
import { PdfLink } from '../pdf-link'
import { ParticipationData } from '@/server/actions/participation-agreement.actions'
import { PlaceholderLabel } from './placeholder-tos-pn'
import { fontWeight } from '@/theme/tokens'

export const TosPnPreview: FC<{ documents: GlobalLegalDocument[] }> = ({ documents }) => (
    <Stack gap="sm" mt="md">
        <LegalMarkdownSections documents={documents} labelSize="sm" />
    </Stack>
)

export const globalDocAgreementLabel = (documents: GlobalLegalDocument[]) => {
    if (documents.length === 0) {
        return <PlaceholderLabel />
    }
    return `I agree to the ${documents.map((document) => legalDocumentTypeLabels[document.type]).join(' and ')}.`
}

export const participationAgreementLabel = (document: ParticipationData | null) => {
    if (!document) return null
    return (
        <>
            I agree to the{' '}
            <PdfLink
                url={document.url}
                label={legalDocumentTypeLabels[document.type]}
                withIcon={false}
                underline="always"
                fw={fontWeight.bold}
            />
            .
        </>
    )
}
