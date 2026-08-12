'use client'

import { useQuery, useState, type FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import { fetchStudyLevelAgreementsAction } from '@/server/actions/legal-document.actions'
import { AppModal } from '@/components/modals/app-modal'
import { Anchor, Button, Flex, Stack, Table, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { UploadSlaForm } from './upload-sla-form'
import { VersionHistoryModal } from '../version-history-modal'

type Sla = ActionSuccessType<typeof fetchStudyLevelAgreementsAction>[number]

const AgreementRow: FC<{
    sla: Sla
    onNewVersion: (sla: Sla) => void
    onViewHistory: (sla: Sla) => void
}> = ({ sla, onNewVersion, onViewHistory }) => (
    <Table.Tr>
        <Table.Td>{sla.studyId}</Table.Td>
        <Table.Td>{sla.studyTitle}</Table.Td>
        <Table.Td>{sla.researchLabName}</Table.Td>
        <Table.Td>{sla.dataPartnerName}</Table.Td>
        <Table.Td>{sla.versionNumber}</Table.Td>
        <Table.Td>{sla.signedAt ?? '—'}</Table.Td>
        <Table.Td>
            <Anchor href={sla.downloadUrl} target="_blank" rel="noreferrer">
                View PDF
            </Anchor>
        </Table.Td>
        <Table.Td>
            <Anchor component="button" type="button" onClick={() => onViewHistory(sla)}>
                Version History
            </Anchor>
        </Table.Td>
        <Table.Td>
            <Button variant="subtle" size="compact-sm" onClick={() => onNewVersion(sla)}>
                Upload new version
            </Button>
        </Table.Td>
    </Table.Tr>
)

const EmptyState: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <Text c="dimmed">No signed SLAs have been uploaded yet</Text>
}

const LoadingState: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <Text c="dimmed">Loading agreements…</Text>
}

export const StudyLevelAgreements: FC = () => {
    const [uploadOpened, { open: openUpload, close: closeUpload }] = useDisclosure(false)
    const [newVersionFor, setNewVersionFor] = useState<Sla | null>(null)
    const [historyFor, setHistoryFor] = useState<Sla | null>(null)
    const { data: agreements = [], isLoading } = useQuery({
        queryKey: legalDocumentQueryKeys.studyLevelAgreements(),
        queryFn: fetchStudyLevelAgreementsAction,
    })

    const closeNewVersion = () => setNewVersionFor(null)
    const closeHistory = () => setHistoryFor(null)

    return (
        <Stack>
            <Flex justify="space-between" align="center">
                <Title order={2}>Study Level Agreements</Title>
                <Button onClick={openUpload}>Upload signed SLA</Button>
            </Flex>
            <AppModal
                isOpen={uploadOpened}
                onClose={closeUpload}
                title="Upload a signed SLA"
                closeOnClickOutside={false}
            >
                <UploadSlaForm onCompleteAction={closeUpload} />
            </AppModal>
            <AppModal
                isOpen={Boolean(newVersionFor)}
                onClose={closeNewVersion}
                title="Upload a new version"
                closeOnClickOutside={false}
            >
                {/* Keyed by study so a second row opens a fresh form rather than the last one's file. */}
                <UploadSlaForm
                    key={newVersionFor?.studyId}
                    onCompleteAction={closeNewVersion}
                    sla={newVersionFor ?? undefined}
                />
            </AppModal>
            <VersionHistoryModal
                isOpen={Boolean(historyFor)}
                onClose={closeHistory}
                title={`${historyFor?.studyTitle ?? ''} — version history`}
                scope={{ type: 'sla', studyId: historyFor?.studyId }}
            />
            <LoadingState isVisible={isLoading} />
            <EmptyState isVisible={!isLoading && agreements.length === 0} />
            <Table withTableBorder withRowBorders horizontalSpacing="md" verticalSpacing="sm">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Study ID</Table.Th>
                        <Table.Th>Study</Table.Th>
                        <Table.Th>Research Lab</Table.Th>
                        <Table.Th>Data Partner</Table.Th>
                        <Table.Th>Version</Table.Th>
                        <Table.Th>Signed on</Table.Th>
                        <Table.Th>Agreement</Table.Th>
                        <Table.Th>History</Table.Th>
                        <Table.Th />
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {agreements.map((sla: Sla) => (
                        <AgreementRow
                            key={sla.legalDocumentId}
                            sla={sla}
                            onNewVersion={setNewVersionFor}
                            onViewHistory={setHistoryFor}
                        />
                    ))}
                </Table.Tbody>
            </Table>
        </Stack>
    )
}
