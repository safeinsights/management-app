'use client'

import { useQuery, type FC } from '@/common'
import { AppModal } from '@/components/modals/app-modal'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentFormats,
    legalDocumentQueryKeys,
    legalDocumentTypeLabels,
    type LegalDocumentTypeValue,
} from '@/schema/legal-document'
import { fetchLegalDocumentVersionsAction } from '@/server/actions/legal-document.actions'
import { Anchor, Stack } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { DataTable, type DataTableColumn } from 'mantine-datatable'
import { formatPublishedOn, formatSignedOn } from './dates'
import { PreviewDocument } from './preview-document'

type Scope = { type: LegalDocumentTypeValue; orgId?: string; studyId?: string }

type Version = NonNullable<ActionSuccessType<typeof fetchLegalDocumentVersionsAction>['current']>

// A version carries a signature date only where there is a counterparty to sign it, which is exactly
// the scoped types: the DB check constraint leaves both scope columns null for tos/pn.
const hasSignatory = (scope: Scope) => Boolean(scope.orgId || scope.studyId)

// Rendered in place rather than linked, because a signed URL to a .md gives the reader raw source or
// a download. Per row so each version opens its own copy.
const PreviewLink: FC<{ url: string; label: string }> = ({ url, label }) => {
    const [isOpen, { open, close }] = useDisclosure(false)

    return (
        <>
            <Anchor component="button" type="button" onClick={open}>
                View
            </Anchor>
            <AppModal isOpen={isOpen} onClose={close} title={label} zIndex={400}>
                <PreviewDocument url={url} label={label} />
            </AppModal>
        </>
    )
}

const documentColumnFor = (type: LegalDocumentTypeValue): DataTableColumn<Version> => {
    if (legalDocumentFormats[type] === 'markdown') {
        return {
            accessor: 'downloadUrl',
            title: 'Document',
            render: (version) => <PreviewLink url={version.downloadUrl} label={legalDocumentTypeLabels[type]} />,
        }
    }

    return {
        accessor: 'downloadUrl',
        title: 'Document',
        render: (version) => (
            <Anchor href={version.downloadUrl} target="_blank" rel="noreferrer">
                View
            </Anchor>
        ),
    }
}

const SIGNED_ON_COLUMN: DataTableColumn<Version> = {
    accessor: 'signedAt',
    title: 'Signed on',
    render: (version) => formatSignedOn(version.signedAt),
}

const columnsFor = (scope: Scope): DataTableColumn<Version>[] => [
    { accessor: 'versionNumber', title: 'Version' },
    ...(hasSignatory(scope) ? [SIGNED_ON_COLUMN] : []),
    { accessor: 'publishedAt', title: 'Published on', render: (version) => formatPublishedOn(version.publishedAt) },
    { accessor: 'publishedByName', title: 'Published by', render: (version) => version.publishedByName ?? '—' },
    documentColumnFor(scope.type),
]

// Fetched on open rather than with the table behind it, so a page of agreements does not pull every
// version and sign every URL up front. Scope-agnostic: the versions of an org's agreement and of a
// study's read the same.
const useVersionHistory = ({ scope, isOpen }: { scope: Scope; isOpen: boolean }) =>
    useQuery({
        queryKey: legalDocumentQueryKeys.versions(scope),
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
                <DataTable
                    horizontalSpacing="md"
                    verticalSpacing="sm"
                    fetching={isLoading}
                    idAccessor="id"
                    noRecordsText="No versions have been published yet."
                    records={published}
                    columns={columnsFor(scope)}
                />
            </Stack>
        </AppModal>
    )
}
