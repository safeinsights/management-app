'use client'

import { useQuery, type FC } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { LegalDocumentContent } from '@/components/legal/document-content'
import { LoadingMessage } from '@/components/loading'
import { formatInstantAsUtcDay } from '@/lib/dates'
import type { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys, legalDocumentTypeLabels, type UserGlobalDocumentType } from '@/schema/legal-document'
import { fetchUserGlobalDocumentAction } from '@/server/actions/legal-document.actions'
import { Group, Paper, Stack, Text, Title } from '@mantine/core'

type GlobalDocument = NonNullable<ActionSuccessType<typeof fetchUserGlobalDocumentAction>>

type Props = { type: UserGlobalDocumentType }

// Both dates are UTC because both are real instants: on mixed bases an ack can read as a day
// earlier than the effective date.
// Acknowledged on is a left join, so it dashes for a user who reached the page owing this version.
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

    return <LegalDocumentContent content={document.content} maxHeight="none" label={label} />
}

export const UserGlobalDocument: FC<Props> = ({ type }) => {
    const label = legalDocumentTypeLabels[type]
    const { data, isLoading, isError, error } = useQuery({
        queryKey: legalDocumentQueryKeys.userGlobalDocument(type),
        queryFn: () => fetchUserGlobalDocumentAction({ type }),
    })

    if (isError) return <ErrorAlert error={error} />

    return (
        <Paper shadow="xs" p="xl">
            <Group justify="space-between" align="flex-start" mb="lg" wrap="nowrap">
                <Title order={3}>{label}</Title>
                <DocumentDates document={data} />
            </Group>
            <DocumentBody isLoading={isLoading} document={data} label={label} />
        </Paper>
    )
}
