'use client'

import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { Stack, Text } from '@mantine/core'
import type { FC } from 'react'
import type { ResolvedLegalDocument } from '@/schema/legal-document'
import { LegalMarkdownContent } from './markdown-content'
import { fontWeight } from '@/theme/tokens'

// Every place a user is asked to agree names the document, then renders it in full. Takes the
// scope-neutral base; a pdf has no inline view (it's the link in the sentence), so nothing renders here.
export const LegalMarkdownSection: FC<{ document: ResolvedLegalDocument }> = ({ document }) => {
    if (document.format !== 'markdown') return null

    const label = legalDocumentTypeLabels[document.type]

    return (
        <Stack gap="xs">
            <Text fw={fontWeight.semibold}>{label}</Text>
            <LegalMarkdownContent content={document.content} label={label} />
        </Stack>
    )
}
