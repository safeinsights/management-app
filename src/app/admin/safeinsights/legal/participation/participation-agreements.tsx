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
import { Anchor, Button, Flex, Stack, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { DataTable, type DataTableColumn } from 'mantine-datatable'
import { VersionHistoryModal } from '../version-history-modal'
import { UploadParticipationAgreementForm } from './upload-participation-agreement-form'

type Agreement = ActionSuccessType<typeof fetchParticipationAgreementsAction>[number]

// Built here rather than inline in the JSX, and DataTable rather than a bare Table so that fetching
// and noRecordsText come from the component the rest of this admin section already uses.
const agreementColumns = ({
    orgLabel,
    onNewVersion,
    onViewHistory,
}: {
    orgLabel: string
    onNewVersion: (agreement: Agreement) => void
    onViewHistory: (agreement: Agreement) => void
}): DataTableColumn<Agreement>[] => [
    { accessor: 'orgName', title: orgLabel },
    { accessor: 'versionNumber', title: 'Version' },
    { accessor: 'signedAt', title: 'Signed on', render: (agreement) => agreement.signedAt ?? '—' },
    {
        accessor: 'downloadUrl',
        title: 'Agreement',
        render: (agreement) => (
            <Anchor href={agreement.downloadUrl} target="_blank" rel="noreferrer">
                View PDF
            </Anchor>
        ),
    },
    {
        accessor: 'history',
        title: 'History',
        render: (agreement) => (
            <Anchor component="button" type="button" onClick={() => onViewHistory(agreement)}>
                Version History
            </Anchor>
        ),
    },
    {
        accessor: 'actions',
        title: '',
        render: (agreement) => (
            <Button variant="subtle" size="compact-sm" onClick={() => onNewVersion(agreement)}>
                Upload new version
            </Button>
        ),
    },
]

// Takes the row itself rather than fields picked out of a possibly-null one, so the form's fixed
// signatory needs no placeholder defaults. Keyed by org so a second row opens a fresh form rather
// than the last one's file.
const NewVersionForm: FC<{
    agreement: Agreement | null
    type: ParticipationAgreementType
    onClose: () => void
}> = ({ agreement, type, onClose }) => {
    if (!agreement) return null

    return (
        <UploadParticipationAgreementForm
            key={agreement.orgId}
            type={type}
            signatory={agreement}
            onCompleteAction={onClose}
        />
    )
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
    const columns = agreementColumns({
        orgLabel,
        onNewVersion: setNewVersionFor,
        onViewHistory: setHistoryFor,
    })

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
                <NewVersionForm agreement={newVersionFor} type={type} onClose={closeNewVersion} />
            </AppModal>
            <VersionHistoryModal
                isOpen={Boolean(historyFor)}
                onClose={closeHistory}
                title={`${historyFor?.orgName ?? ''} — version history`}
                scope={{ type, orgId: historyFor?.orgId }}
            />
            <DataTable
                withTableBorder
                horizontalSpacing="md"
                verticalSpacing="sm"
                fetching={isLoading}
                idAccessor="legalDocumentId"
                noRecordsText="No agreements to show"
                records={agreements}
                columns={columns}
            />
        </Stack>
    )
}
