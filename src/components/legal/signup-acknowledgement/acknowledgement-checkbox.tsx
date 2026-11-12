'use client'

import { type GlobalLegalDocument, legalDocumentTypeLabels } from '@/schema/legal-document'
import { Anchor, Stack } from '@mantine/core'
import { FC } from 'react'
import { LegalMarkdownSections } from '../markdown-sections'
import { ParticipationData } from '@/server/actions/participation-agreement.actions'
import { PlaceholderLabel } from './placeholder-tos-pn'
import { fontWeight, semanticColor } from '@/theme/tokens'

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
            {/* Not PdfLink: its label never wraps, which pushes the form past a phone's width (OTTER-951). */}
            <Anchor
                href={document.url}
                target="_blank"
                rel="noreferrer"
                c={semanticColor('link.default')}
                fz="sm"
                fw={fontWeight.bold}
                underline="always"
            >
                {legalDocumentTypeLabels[document.type]}
            </Anchor>
            .
        </>
    )
}
