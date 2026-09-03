'use client'

import { useQuery, type FC } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { LegalMarkdownContent } from '@/components/legal/markdown-content'
import { LegalPanel } from '@/components/legal/legal-panel'
import { LoadingMessage } from '@/components/loading'
import { formatInstantAsUtcDay } from '@/lib/dates'
import type { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys, legalDocumentTypeLabels, type UserGlobalDocumentType } from '@/schema/legal-document'
import { fetchUserGlobalDocumentAction } from '@/server/actions/legal-document.actions'
import { Stack, Text } from '@mantine/core'

type GlobalDocument = NonNullable<ActionSuccessType<typeof fetchUserGlobalDocumentAction>>

type Props = { type: UserGlobalDocumentType }

// Both dates are UTC because both are real instants: on mixed bases an ack can read as a day
// earlier than the effective date. Acknowledged on is a left join, so it dashes for a user who
// reached the page owing this version.
const DocumentDates: FC<{ document?: GlobalDocument | null }> = ({ document }) => {
    if (!document) return null

    return (
        <Stack gap={2} align="flex-end">
            <Text fz="sm" c="dimmed">
                Effective on: {formatInstantAsUtcDay(document.publishedAt)}
            </Text>
            <Text fz="sm" c="dimmed">
                Acknowledged on: {formatInstantAsUtcDay(document.ackedAt)}
            </Text>
        </Stack>
    )
}

const DocumentBody: FC<{ isLoading: boolean; document?: GlobalDocument | null; label: string }> = ({
    isLoading,
    document,
    label,
}) => {
    if (isLoading) return <LoadingMessage message={`Loading ${label}`} />
    if (!document) return <Text c="dimmed">Not available</Text>

    return <LegalMarkdownContent content={document.content} unbounded label={label} />
}

export const UserGlobalDocument: FC<Props> = ({ type }) => {
    const label = legalDocumentTypeLabels[type]
    const { data, isLoading, isError, error } = useQuery({
        queryKey: legalDocumentQueryKeys.userGlobalDocument(type),
        queryFn: () => fetchUserGlobalDocumentAction({ type }),
    })

    if (isError) return <ErrorAlert error={error} />

    return (
        <LegalPanel title={label} aside={<DocumentDates document={data} />}>
            <DocumentBody isLoading={isLoading} document={data} label={label} />
        </LegalPanel>
    )
}
