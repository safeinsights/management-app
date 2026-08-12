'use client'

import { useQuery, useState, type FC } from '@/common'
import { AppModal } from '@/components/modals/app-modal'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentTypeLabels,
    participationAgreementOrgLabels,
    type ParticipationAgreementType,
} from '@/schema/legal-document'
import { fetchParticipationAgreementsAction } from '@/server/actions/legal-document.actions'
import { Anchor, Button, Flex, Stack, Table, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { VersionHistoryModal } from '../version-history-modal'
import { UploadParticipationAgreementForm } from './upload-participation-agreement-form'

type Agreement = ActionSuccessType<typeof fetchParticipationAgreementsAction>[number]

const AgreementRow: FC<{
    agreement: Agreement
    onNewVersion: (agreement: Agreement) => void
    onViewHistory: (agreement: Agreement) => void
}> = ({ agreement, onNewVersion, onViewHistory }) => (
    <Table.Tr>
        <Table.Td>{agreement.orgName}</Table.Td>
        <Table.Td>{agreement.versionNumber}</Table.Td>
        <Table.Td>{agreement.signedAt ?? '—'}</Table.Td>
        <Table.Td>
            <Anchor href={agreement.downloadUrl} target="_blank" rel="noreferrer">
                View PDF
            </Anchor>
        </Table.Td>
        <Table.Td>
            <Anchor component="button" type="button" onClick={() => onViewHistory(agreement)}>
                Version History
            </Anchor>
        </Table.Td>
        <Table.Td>
            <Button variant="subtle" size="compact-sm" onClick={() => onNewVersion(agreement)}>
                Upload new version
            </Button>
        </Table.Td>
    </Table.Tr>
)

const EmptyState: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <Text c="dimmed">No agreements to show</Text>
}

const LoadingState: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <Text c="dimmed">Loading agreements…</Text>
}

export const ParticipationAgreements: FC<{ type: ParticipationAgreementType }> = ({ type }) => {
    const [uploadOpened, { open: openUpload, close: closeUpload }] = useDisclosure(false)
    const [newVersionFor, setNewVersionFor] = useState<Agreement | null>(null)
    const [historyFor, setHistoryFor] = useState<Agreement | null>(null)
    const { data: agreements = [], isLoading } = useQuery({
        queryKey: legalDocumentQueryKeys.participationAgreements(type),
        queryFn: () => fetchParticipationAgreementsAction({ type }),
    })

    const label = legalDocumentTypeLabels[type]
    const orgLabel = participationAgreementOrgLabels[type]
    const closeNewVersion = () => setNewVersionFor(null)
    const closeHistory = () => setHistoryFor(null)

    return (
        <Stack>
            <Flex justify="space-between" align="center">
                <Title order={2}>{label}s</Title>
                <Button onClick={openUpload}>Upload</Button>
            </Flex>
            <AppModal
                isOpen={uploadOpened}
                onClose={closeUpload}
                title={`Upload a signed ${label}`}
                closeOnClickOutside={false}
            >
                <UploadParticipationAgreementForm type={type} onCompleteAction={closeUpload} />
            </AppModal>
            <AppModal
                isOpen={Boolean(newVersionFor)}
                onClose={closeNewVersion}
                title="Upload a new version"
                closeOnClickOutside={false}
            >
                {/* Keyed by org so a second row opens a fresh form rather than the last one's file. */}
                <UploadParticipationAgreementForm
                    key={newVersionFor?.orgId}
                    type={type}
                    signatory={{
                        orgId: newVersionFor?.orgId ?? '',
                        orgName: newVersionFor?.orgName ?? '',
                        versionNumber: newVersionFor?.versionNumber ?? null,
                    }}
                    onCompleteAction={closeNewVersion}
                />
            </AppModal>
            <VersionHistoryModal
                isOpen={Boolean(historyFor)}
                onClose={closeHistory}
                title={`${historyFor?.orgName ?? ''} — version history`}
                scope={{ type, orgId: historyFor?.orgId }}
            />
            <LoadingState isVisible={isLoading} />
            <EmptyState isVisible={!isLoading && agreements.length === 0} />
            <Table withTableBorder withRowBorders horizontalSpacing="md" verticalSpacing="sm">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>{orgLabel}</Table.Th>
                        <Table.Th>Version</Table.Th>
                        <Table.Th>Signed on</Table.Th>
                        <Table.Th>Agreement</Table.Th>
                        <Table.Th>History</Table.Th>
                        <Table.Th />
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {agreements.map((agreement: Agreement) => (
                        <AgreementRow
                            key={agreement.legalDocumentId}
                            agreement={agreement}
                            onNewVersion={setNewVersionFor}
                            onViewHistory={setHistoryFor}
                        />
                    ))}
                </Table.Tbody>
            </Table>
        </Stack>
    )
}
