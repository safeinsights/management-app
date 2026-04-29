'use client'

import { Stack, Title, Divider, Paper, Text, Button, Group, ActionIcon, Tooltip, Anchor, Box } from '@mantine/core'
import { useQuery, useQueryClient, useMutation } from '@/common'
import { useParams } from 'next/navigation'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from '@/components/modal'
import { DataSourceForm } from './data-source-form'
import { TrashIcon, PlusCircleIcon, PencilIcon } from '@phosphor-icons/react/dist/ssr'
import { deleteOrgDataSourceAction, fetchOrgDataSourcesAction } from './data-sources.actions'
import { SuretyGuard } from '@/components/surety-guard'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { ErrorPanel } from '@/components/panel'
import { LoadingMessage } from '@/components/loading'
import { ActionSuccessType } from '@/lib/types'

type DataSource = ActionSuccessType<typeof fetchOrgDataSourcesAction>[number]

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
        <Box style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
            <Group justify="space-between" p="sm" wrap="nowrap">
                <Box style={{ minWidth: 0, flex: 1 }}>
                    <Group gap="sm" wrap="nowrap">
                        <Text fw={500}>{dataSource.name}</Text>
                        <Text c="dimmed" size="sm">
                            {dataSource.codeEnvs.map((e) => e.name).join(', ')}
                        </Text>
                    </Group>
                    {dataSource.description && (
                        <Text size="sm" c="dimmed" lineClamp={1}>
                            {dataSource.description}
                        </Text>
                    )}
                    {dataSource.documents.map(
                        (d) =>
                            d.url && (
                                <Group key={d.id} gap="sm" wrap="nowrap">
                                    <Text>
                                        <Anchor size="sm" href={d.url} target="_blank" rel="noopener noreferrer">
                                            {d.url}
                                        </Anchor>
                                    </Text>
                                    <Text c="dimmed" size="sm">
                                        {d.description}
                                    </Text>
                                </Group>
                            ),
                    )}
                </Box>
                <Group gap={4} wrap="nowrap">
                    <Tooltip label="Edit" withArrow>
                        <ActionIcon size="sm" variant="subtle" color="green" onClick={openEditModal}>
                            <PencilIcon />
                        </ActionIcon>
                    </Tooltip>
                    <SuretyGuard
                        onConfirmed={() => deleteMutation.mutate({ orgSlug, dataSourceId: dataSource.id })}
                        message="Are you sure you want to delete this data source? This cannot be undone."
                    >
                        <TrashIcon />
                    </SuretyGuard>
                </Group>
            </Group>

            <AppModal isOpen={editModalOpened} onClose={closeEditModal} title="Edit Data Source">
                <DataSourceForm dataSource={dataSource} onCompleteAction={handleEditComplete} />
            </AppModal>
        </Box>
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

    const {
        data: dataSources,
        isLoading,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: ['orgDataSources', orgSlug],
        queryFn: async () => await fetchOrgDataSourcesAction({ orgSlug }),
    })

    const handleFormComplete = () => {
        closeAddModal()
        queryClient.invalidateQueries({ queryKey: ['orgDataSources', orgSlug] })
    }

    return (
        <Paper bg="white" p="xxl">
            <Stack>
                <Group justify="space-between" align="center">
                    <Title order={3} size="lg">
                        Data Sources
                    </Title>
                    <Button leftSection={<PlusCircleIcon size={16} />} onClick={openAddModal}>
                        Add Data Source
                    </Button>
                </Group>
                <Divider c="dimmed" />

                {isLoading && <LoadingMessage message="Loading data sources" />}

                {isError && (
                    <ErrorPanel
                        title={`Failed to load data sources: ${error?.message || 'Unknown error'}`}
                        onContinue={refetch}
                    >
                        Retry
                    </ErrorPanel>
                )}

                {!isLoading && !isError && <DataSourcesTable dataSources={dataSources || []} />}
            </Stack>

            <AppModal isOpen={addModalOpened} onClose={closeAddModal} title="Add Data Source">
                <DataSourceForm onCompleteAction={handleFormComplete} />
            </AppModal>
        </Paper>
    )
}
