import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { Text } from '@mantine/core'
import { LinkWithIcon } from '../links'
import { EMPTY_CELL } from '@/lib/dates'
import { legalDocumentDownloadURL } from '@/lib/paths'
import { type FC } from 'react'

// Null carries through from an unsigned row, so table callers need no guard of their own.
export const PdfLink: FC<{ url: string | null; label?: string }> = ({ url, label = 'PDF' }) => {
    if (!url) return <Text c="dimmed">{EMPTY_CELL}</Text>

    return (
        <LinkWithIcon href={url} target="_blank" rel="noreferrer" icon={<ArrowSquareOutIcon size={14} />}>
            {label}
        </LinkWithIcon>
    )
}

// The route presigns on request, so a table of these costs no signatures until one is clicked.
export const LegalDocumentPdfLink: FC<{ versionId: string | null; label?: string }> = ({ versionId, label }) => {
    if (!versionId) return <PdfLink url={null} label={label} />

    return <PdfLink url={legalDocumentDownloadURL(versionId)} label={label} />
}
