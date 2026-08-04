'use client'

import { useQuery, useState, type FC } from '@/common'
import { AppModal } from '@/components/modals/app-modal'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentTypeLabels,
    participationAgreementOrgLabels,
    type ParticipationAgreementType,
} from '@/schema/legal-document'
import { fetchParticipationAgreementsAction } from '@/server/actions/legal-document.actions'
import { Anchor, Button, Stack, Table, Text, Title } from '@mantine/core'
import { VersionHistoryModal } from '../version-history-modal'
import { UploadParticipationAgreementForm } from './upload-participation-agreement-form'

type Agreement = ActionSuccessType<typeof fetchParticipationAgreementsAction>[number]

const AgreementLink: FC<{ agreement: Agreement }> = ({ agreement }) => {
    if (!agreement.downloadUrl) return <Text c="dimmed">—</Text>

    return (
        <Anchor href={agreement.downloadUrl} target="_blank" rel="noreferrer">
            View PDF
        </Anchor>
    )
}

const HistoryLink: FC<{ agreement: Agreement; onClick: (agreement: Agreement) => void }> = ({ agreement, onClick }) => {
    if (!agreement.legalDocumentId) return <Text c="dimmed">—</Text>

    return (
        <Anchor component="button" type="button" onClick={() => onClick(agreement)}>
            Version History
        </Anchor>
    )
}

const AgreementRow: FC<{
    agreement: Agreement
    onUpload: (agreement: Agreement) => void
    onViewHistory: (agreement: Agreement) => void
}> = ({ agreement, onUpload, onViewHistory }) => (
    <Table.Tr>
        <Table.Td>{agreement.orgName}</Table.Td>
        <Table.Td>{agreement.versionNumber ?? '—'}</Table.Td>
        <Table.Td>{agreement.signedAt ?? '—'}</Table.Td>
        <Table.Td>
            <AgreementLink agreement={agreement} />
        </Table.Td>
        <Table.Td>
            <HistoryLink agreement={agreement} onClick={onViewHistory} />
        </Table.Td>
        <Table.Td>
            <Button variant="subtle" size="compact-sm" onClick={() => onUpload(agreement)}>
                {agreement.versionNumber ? 'Upload new version' : 'Upload'}
            </Button>
        </Table.Td>
    </Table.Tr>
)

const EmptyState: FC<{ isVisible: boolean; orgLabel: string }> = ({ isVisible, orgLabel }) => {
    if (!isVisible) return null
    return <Text c="dimmed">There are no {orgLabel}s to sign this agreement with yet.</Text>
}

const LoadingState: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <Text c="dimmed">Loading agreements…</Text>
}

export const ParticipationAgreements: FC<{ type: ParticipationAgreementType }> = ({ type }) => {
    const [uploadFor, setUploadFor] = useState<Agreement | null>(null)
    const [historyFor, setHistoryFor] = useState<Agreement | null>(null)
    const { data: agreements = [], isLoading } = useQuery({
        queryKey: ['participationAgreements', type],
        queryFn: () => fetchParticipationAgreementsAction({ type }),
    })

    const orgLabel = participationAgreementOrgLabels[type]
    const closeUpload = () => setUploadFor(null)
    const closeHistory = () => setHistoryFor(null)

    return (
        <Stack>
            <Title order={2}>{legalDocumentTypeLabels[type]}</Title>
            <LoadingState isVisible={isLoading} />
            <EmptyState isVisible={!isLoading && agreements.length === 0} orgLabel={orgLabel} />
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
                            key={agreement.orgId}
                            agreement={agreement}
                            onUpload={setUploadFor}
                            onViewHistory={setHistoryFor}
                        />
                    ))}
                </Table.Tbody>
            </Table>
            <AppModal
                isOpen={Boolean(uploadFor)}
                onClose={closeUpload}
                title={`Upload a signed ${legalDocumentTypeLabels[type]}`}
                closeOnClickOutside={false}
            >
                {/* Keyed by org so a second row opens a fresh form rather than the last one's file. */}
                <UploadParticipationAgreementForm
                    key={uploadFor?.orgId}
                    type={type}
                    signatory={{
                        orgId: uploadFor?.orgId ?? '',
                        orgName: uploadFor?.orgName ?? '',
                        versionNumber: uploadFor?.versionNumber ?? null,
                    }}
                    onCompleteAction={closeUpload}
                />
            </AppModal>
            <VersionHistoryModal
                isOpen={Boolean(historyFor)}
                onClose={closeHistory}
                title={`${historyFor?.orgName ?? ''} — version history`}
                scope={{ type, orgId: historyFor?.orgId }}
            />
        </Stack>
    )
}
