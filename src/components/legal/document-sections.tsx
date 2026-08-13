'use client'

import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { Stack, Text } from '@mantine/core'
import type { FC } from 'react'
import type { PublicLegalDocument } from './acknowledgement-copy'
import { LegalDocumentContent } from './document-content'

// Every place a user is asked to agree names the document, then renders it in full.
export const LegalDocumentSection: FC<{ document: PublicLegalDocument; labelSize?: string }> = ({
    document,
    labelSize,
}) => (
    <Stack gap="xs">
        <Text fw={600} fz={labelSize}>
            {legalDocumentTypeLabels[document.type]}
        </Text>
        <LegalDocumentContent content={document.content} label={legalDocumentTypeLabels[document.type]} />
    </Stack>
)

// Signup agrees to everything published at once; the app-wide gate asks one document at a time.
export const LegalDocumentSections: FC<{ documents: PublicLegalDocument[]; labelSize?: string }> = ({
    documents,
    labelSize,
}) => (
    <Stack gap="md">
        {documents.map((document) => (
            <LegalDocumentSection key={document.versionId} document={document} labelSize={labelSize} />
        ))}
    </Stack>
)
