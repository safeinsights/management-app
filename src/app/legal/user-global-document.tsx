'use client'

import { useQuery, type FC } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { LegalMarkdownContent } from '@/components/legal/markdown-content'
import { LegalPanel } from '@/components/legal/legal-panel'
import { PdfLink } from '@/components/legal/pdf-link'
import { LoadingMessage } from '@/components/loading'
import { formatInstantAsUtcDay } from '@/lib/dates'
import type { ActionSuccessType } from '@/lib/types'
import { type GlobalLegalDocumentType, legalDocumentQueryKeys, legalDocumentTypeLabels } from '@/schema/legal-document'
import { fetchUserGlobalDocumentAction } from '@/server/actions/user-legal.actions'
import { Divider, Text } from '@mantine/core'

type GlobalDocument = NonNullable<ActionSuccessType<typeof fetchUserGlobalDocumentAction>>

type Props = { type: GlobalLegalDocumentType }

// The effective date lives in the document text (SHRMP-367). Acknowledged on is a left join, so it
// dashes for a user who reached the page owing this version.
const DocumentDates: FC<{ document?: GlobalDocument | null }> = ({ document }) => {
    if (!document) return null

    return (
        <Text fz="sm" c="dimmed">
            Acknowledged on: {formatInstantAsUtcDay(document.ackedAt)}
        </Text>
    )
}

// A global document is markdown today, but the format rides the payload, so a pdf renders as a
// link rather than as its own bytes.
const DocumentBody: FC<{ isLoading: boolean; document?: GlobalDocument | null; label: string }> = ({
    isLoading,
    document,
    label,
}) => {
    if (isLoading) return <LoadingMessage message={`Loading ${label}`} />
    if (!document) return <Text c="dimmed">Not available</Text>
    if (document.format === 'pdf') return <PdfLink url={document.url} label={label} />

    // No label: the document's own title names it, and unbounded has no scroll region to name.
    return <LegalMarkdownContent content={document.content} unbounded />
}

// A markdown document opens with its own title, so the panel would repeat it (SHRMP-367).
const panelTitle = (isLoading: boolean, document: GlobalDocument | null | undefined, label: string) =>
    isLoading || document?.format === 'markdown' ? undefined : label

export const UserGlobalDocument: FC<Props> = ({ type }) => {
    const label = legalDocumentTypeLabels[type]
    const { data, isLoading, isError, error } = useQuery({
        queryKey: legalDocumentQueryKeys.userGlobalDocument(type),
        queryFn: () => fetchUserGlobalDocumentAction({ type }),
    })

    if (isError) return <ErrorAlert error={error} />

    return (
        <LegalPanel title={panelTitle(isLoading, data, label)} aside={<DocumentDates document={data} />}>
            <Divider mb="lg" />
            <DocumentBody isLoading={isLoading} document={data} label={label} />
        </LegalPanel>
    )
}
