'use client'

import { useQuery, type FC } from '@/common'
import { AppModal } from '@/components/modals/app-modal'
import type { ActionSuccessType } from '@/lib/types'
import type { LegalDocumentTypeValue } from '@/schema/legal-document'
import { fetchLegalDocumentVersionsAction } from '@/server/actions/legal-document.actions'
import { Anchor, Stack, Table, Text } from '@mantine/core'

type Scope = { type: LegalDocumentTypeValue; orgId?: string; studyId?: string }

type Version = NonNullable<ActionSuccessType<typeof fetchLegalDocumentVersionsAction>['current']>

const formatPublishedOn = (publishedAt: Version['publishedAt']) =>
    publishedAt ? new Date(publishedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'

const VersionRow: FC<{ version: Version }> = ({ version }) => (
    <Table.Tr>
        <Table.Td>{version.versionNumber}</Table.Td>
        <Table.Td>{version.signedAt ?? '—'}</Table.Td>
        <Table.Td>{formatPublishedOn(version.publishedAt)}</Table.Td>
        <Table.Td>{version.publishedByName ?? '—'}</Table.Td>
        <Table.Td>
            <Anchor href={version.downloadUrl} target="_blank" rel="noreferrer">
                View
            </Anchor>
        </Table.Td>
    </Table.Tr>
)

const VersionTable: FC<{ isVisible: boolean; versions: Version[] }> = ({ isVisible, versions }) => {
    if (!isVisible) return null

    return (
        <Table withRowBorders horizontalSpacing="md" verticalSpacing="sm">
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Version</Table.Th>
                    <Table.Th>Signed on</Table.Th>
                    <Table.Th>Published on</Table.Th>
                    <Table.Th>Published by</Table.Th>
                    <Table.Th>Document</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {versions.map((version) => (
                    <VersionRow key={version.id} version={version} />
                ))}
            </Table.Tbody>
        </Table>
    )
}

const EmptyState: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <Text c="dimmed">No versions have been published yet.</Text>
}

const LoadingState: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <Text c="dimmed">Loading version history…</Text>
}

// Fetched on open rather than with the table behind it, so a page of agreements does not pull every
// version and sign every URL up front. Scope-agnostic: the versions of an org's agreement and of a
// study's read the same.
const useVersionHistory = ({ scope, isOpen }: { scope: Scope; isOpen: boolean }) =>
    useQuery({
        queryKey: ['legalDocumentVersions', scope.type, scope.orgId, scope.studyId],
        queryFn: () => fetchLegalDocumentVersionsAction(scope),
        enabled: isOpen,
    })

export const VersionHistoryModal: FC<{
    isOpen: boolean
    onClose: () => void
    title: string
    scope: Scope
}> = ({ isOpen, onClose, title, scope }) => {
    const { data, isLoading } = useVersionHistory({ scope, isOpen })
    const published = data ? [data.current, ...data.history].filter((version) => version !== null) : []

    return (
        <AppModal isOpen={isOpen} onClose={onClose} title={title}>
            <Stack>
                <LoadingState isVisible={isLoading} />
                <EmptyState isVisible={!isLoading && published.length === 0} />
                <VersionTable isVisible={published.length > 0} versions={published} />
            </Stack>
        </AppModal>
    )
}
