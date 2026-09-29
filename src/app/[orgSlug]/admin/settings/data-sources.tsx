'use client'

import { Stack, Text, ActionIcon, Tooltip } from '@mantine/core'
import { useQuery, useQueryClient, useMutation } from '@/common'
import { useParams } from 'next/navigation'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from '@/components/modals/app-modal'
import { DataSourceForm } from './data-source-form'
import { DataSourceRowView, DataSourcesView } from './data-sources-view'
import { TrashIcon, PencilIcon } from '@phosphor-icons/react/dist/ssr'
import { deleteOrgDataSourceAction, fetchOrgDataSourcesAction } from './data-sources.actions'
import { SuretyGuard } from '@/components/surety-guard'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { ActionSuccessType } from '@/lib/types'
import { QueryStateBody } from './query-state-body'

type DataSource = ActionSuccessType<typeof fetchOrgDataSourcesAction>[number]

// Module-level, so a render that has no data yet does not mint a new array identity each time.
const NO_DATA_SOURCES: DataSource[] = []

const DataSourceRow: React.FC<{ dataSource: DataSource }> = ({ dataSource }) => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const queryClient = useQueryClient()
    const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false)

    const deleteMutation = useMutation({
        mutationFn: deleteOrgDataSourceAction,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orgDataSources', orgSlug] })
            reportSuccess('Data source was deleted successfully')
        },
        onError: reportMutationError('Failed to delete data source'),
    })

    const handleEditComplete = () => {
        closeEditModal()
        queryClient.invalidateQueries({ queryKey: ['orgDataSources', orgSlug] })
    }

    return (
        <>
            <DataSourceRowView
                name={dataSource.name}
                codeEnvNames={dataSource.codeEnvs.map((e) => e.name).join(', ')}
                description={dataSource.description}
                urls={dataSource.urls}
                actions={
                    <>
                        <Tooltip label="Edit" withArrow>
                            <ActionIcon
                                size="sm"
                                variant="subtle"
                                color="green"
                                onClick={openEditModal}
                                aria-label="Edit data source"
                            >
                                <PencilIcon />
                            </ActionIcon>
                        </Tooltip>
                        <SuretyGuard
                            onConfirmed={() => deleteMutation.mutate({ orgSlug, dataSourceId: dataSource.id })}
                            message="Are you sure you want to delete this data source? This cannot be undone."
                        >
                            <TrashIcon aria-label="Delete data source" />
                        </SuretyGuard>
                    </>
                }
            />

            <AppModal isOpen={editModalOpened} onClose={closeEditModal} title="Edit Data Source">
                <DataSourceForm dataSource={dataSource} onCompleteAction={handleEditComplete} />
            </AppModal>
        </>
    )
}

const DataSourcesTable: React.FC<{ dataSources: DataSource[] }> = ({ dataSources }) => {
    if (!dataSources.length) {
        return (
            <Text fz="sm" c="dimmed" ta="center" p="md">
                No data sources available.
            </Text>
        )
    }

    return (
        <Stack gap={0}>
            {dataSources.map((ds) => (
                <DataSourceRow key={ds.id} dataSource={ds} />
            ))}
        </Stack>
    )
}

export const DataSources: React.FC = () => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const queryClient = useQueryClient()
    const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false)

    const dataSources = useQuery({
        queryKey: ['orgDataSources', orgSlug],
        queryFn: async () => await fetchOrgDataSourcesAction({ orgSlug }),
    })

    const handleFormComplete = () => {
        closeAddModal()
        queryClient.invalidateQueries({ queryKey: ['orgDataSources', orgSlug] })
    }

    return (
        <>
            <DataSourcesView onAdd={openAddModal}>
                <QueryStateBody query={dataSources} loadingMessage="Loading data sources" errorLabel="data sources">
                    <DataSourcesTable dataSources={dataSources.data ?? NO_DATA_SOURCES} />
                </QueryStateBody>
            </DataSourcesView>

            <AppModal isOpen={addModalOpened} onClose={closeAddModal} title="Add Data Source">
                <DataSourceForm onCompleteAction={handleFormComplete} />
            </AppModal>
        </>
    )
}
