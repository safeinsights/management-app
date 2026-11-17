import { Container, Text, Title } from '@mantine/core'
import type { FC } from 'react'
import { actionResult } from '@/lib/utils'
import {
    type GlobalLegalDocument,
    type GlobalLegalDocumentType,
    legalDocumentTypeLabels,
} from '@/schema/legal-document'
import { fetchGlobalLegalDocumentsAction } from '@/server/actions/legal-acknowledgement.actions'
import { LegalMarkdownContent } from './markdown-content'
import { PdfLink } from './pdf-link'

const NotPublished: FC<{ label: string }> = ({ label }) => (
    <>
        <Title order={1}>{label}</Title>
        <Text c="dimmed" mt="md">
            The {label} has not been published yet.
        </Text>
    </>
)

const DocumentBody: FC<{ document?: GlobalLegalDocument; label: string }> = ({ document, label }) => {
    if (!document) return <NotPublished label={label} />
    if (document.format === 'pdf') return <PdfLink url={document.url} label={label} />

    return <LegalMarkdownContent content={document.content} unbounded />
}

// No layout shell on purpose: the signup form links here, and the page must not lead anywhere else.
export async function PublicGlobalDocument({ type }: { type: GlobalLegalDocumentType }) {
    const documents = actionResult(await fetchGlobalLegalDocumentsAction())

    return (
        <Container size="md" py="xl">
            <DocumentBody
                document={documents.find((document) => document.type === type)}
                label={legalDocumentTypeLabels[type]}
            />
        </Container>
    )
}
