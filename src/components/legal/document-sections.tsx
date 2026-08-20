'use client'

import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { Stack, Text } from '@mantine/core'
import type { FC } from 'react'
import { LegalDocumentContent } from './document-content'
import type { ResolvedLegalDocument } from '@/schema/legal-document'

// Every place a user is asked to agree names the document, then renders it in full. Takes the
// scope-neutral base; a pdf has no inline view (it's the link in the sentence), so nothing renders here.
export const LegalDocumentSection: FC<{ document: ResolvedLegalDocument; labelSize?: string }> = ({
    document,
    labelSize,
}) => {
    if (document.format !== 'markdown') return null

    const label = legalDocumentTypeLabels[document.type]

    return (
        <Stack gap="xs">
            <Text fw={600} fz={labelSize}>
                {label}
            </Text>
            <LegalDocumentContent content={document.content} label={label} />
        </Stack>
    )
}

// Signup agrees to everything published at once; the app-wide gate asks one document at a time.
export const LegalDocumentSections: FC<{ documents: ResolvedLegalDocument[]; labelSize?: string }> = ({
    documents,
    labelSize,
}) => (
    <Stack gap="md">
        {documents.map((document) => (
            <LegalDocumentSection key={document.versionId} document={document} labelSize={labelSize} />
        ))}
    </Stack>
)
