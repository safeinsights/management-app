'use client'

import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { Stack, Text } from '@mantine/core'
import type { FC } from 'react'
import type { PublicLegalDocument } from './acknowledgement-copy'
import { LegalDocumentContent } from './document-content'

// Every place a user is asked to agree names the document, then renders it in full.
export const LegalDocumentSections: FC<{ documents: PublicLegalDocument[]; labelSize?: string }> = ({
    documents,
    labelSize,
}) => (
    <Stack gap="md">
        {documents.map((document) => (
            <Stack key={document.versionId} gap="xs">
                <Text fw={600} fz={labelSize}>
                    {legalDocumentTypeLabels[document.type]}
                </Text>
                <LegalDocumentContent content={document.content} label={legalDocumentTypeLabels[document.type]} />
            </Stack>
        ))}
    </Stack>
)
