'use client'

import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { Stack, Text } from '@mantine/core'
import type { FC } from 'react'
import type { PublicLegalDocument } from './acknowledgement-copy'
import { LegalDocumentContent } from './document-content'

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
