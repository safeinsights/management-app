'use client'

import { Stack, Title, Divider, Paper, Text, Table, Button, Group, ActionIcon, Tooltip, Flex } from '@mantine/core'
import { useQuery, useQueryClient, useMutation } from '@/common'
import { useParams } from 'next/navigation'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from '@/components/modal'
import { CodeEnvForm } from './code-env-form'
import { TrashIcon, PlusCircleIcon, PencilIcon, FileMagnifyingGlassIcon } from '@phosphor-icons/react/dist/ssr'
import { deleteOrgCodeEnvAction, fetchOrgCodeEnvsAction, fetchStarterCodeAction } from './code-envs.actions'
import { SuretyGuard } from '@/components/surety-guard'
import { reportMutationError, reportError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { ErrorPanel } from '@/components/panel'
import { LoadingMessage } from '@/components/loading'
import { ActionSuccessType } from '@/lib/types'
import { basename } from '@/lib/paths'
import { CodeViewer } from '@/components/code-viewer'
import { useState } from 'react'
import { isActionError } from '@/lib/errors'
import { OrgCodeEnvSettings } from '@/database/types'

type CodeEnv = ActionSuccessType<typeof fetchOrgCodeEnvsAction>[number]

const CodeEnvRow: React.FC<{ image: CodeEnv; canDelete: boolean }> = ({ image, canDelete }) => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const queryClient = useQueryClient()
    const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false)
    const [codeViewerOpened, { open: openCodeViewer, close: closeCodeViewer }] = useDisclosure(false)
    const [starterCode, setStarterCode] = useState<string | null>(null)
    const [isLoadingCode, setIsLoadingCode] = useState(false)

    const deleteMutation = useMutation({
        mutationFn: deleteOrgCodeEnvAction,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['orgCodeEnvs', orgSlug],
            })
            reportSuccess('Code environment was deleted successfully')
        },
        onError: reportMutationError('Failed to delete code environment'),
    })

    const handleEditComplete = () => {
        closeEditModal()
        queryClient.invalidateQueries({ queryKey: ['orgCodeEnvs', orgSlug] })
    }

    const handleViewCode = async () => {
        setIsLoadingCode(true)
        try {
            const result = await fetchStarterCodeAction({
                orgSlug,
                imageId: image.id,
            })
            if (isActionError(result)) {
                reportError(result)
            } else {
                setStarterCode(result.content)
                openCodeViewer()
            }
        } catch (error) {
            reportError(error)
        } finally {
            setIsLoadingCode(false)
        }
    }

    const DeleteCodeEnv = () => {
        if (!canDelete) return null

        return (
            <SuretyGuard
                onConfirmed={() => deleteMutation.mutate({ imageId: image.id, orgSlug })}
                message="Are you sure you want to delete this code environment? This cannot be undone."
            >
                <TrashIcon />
            </SuretyGuard>
        )
    }

    return (
        <Table.Tr>
            <Table.Td>
                <Group gap="xs" wrap="nowrap">
                    <Text>{image.name}</Text>
                </Group>
            </Table.Td>
            <Table.Td>{image.language}</Table.Td>
            <Table.Td>{image.url}</Table.Td>
            <Table.Td>{image.cmdLine}</Table.Td>
            <Table.Td>
                <Flex align="center" gap="sm">
                    <span>{basename(image.starterCodePath)}</span>
                    <Tooltip label="View Starter Code" withArrow>
                        <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="blue"
                            onClick={handleViewCode}
                            loading={isLoadingCode}
                        >
                            <FileMagnifyingGlassIcon />
                        </ActionIcon>
                    </Tooltip>
                </Flex>
            </Table.Td>
            <Table.Td>{image.sampleDataPath || '-'}</Table.Td>
            <Table.Td>{image.isTesting ? 'Yes' : 'No'}</Table.Td>
            <Table.Td>
                <Text
                    size="sm"
                    style={{
                        maxWidth: 100,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {((image.settings as OrgCodeEnvSettings)?.environment || [])
                        .map((v) => `${v.name}=${v.value}`)
                        .join(', ') || '-'}
                </Text>
            </Table.Td>
            <Table.Td>{new Date(image.createdAt).toISOString()}</Table.Td>
            <Table.Td>
                <Group gap={4} justify="center" wrap="nowrap">
                    <Tooltip label="Edit" withArrow>
                        <ActionIcon size="sm" variant="subtle" color="green" onClick={openEditModal}>
                            <PencilIcon />
                        </ActionIcon>
                    </Tooltip>
                    <DeleteCodeEnv />
                </Group>
                <AppModal isOpen={editModalOpened} onClose={closeEditModal} title="Edit Code Environment">
                    <CodeEnvForm image={image} onCompleteAction={handleEditComplete} />
                </AppModal>
                <AppModal
                    isOpen={codeViewerOpened}
                    onClose={closeCodeViewer}
                    title={`Starter Code: ${basename(image.starterCodePath)}`}
                    size="xl"
                >
                    {starterCode ? (
                        <CodeViewer
                            code={starterCode}
                            language={image.language.toLowerCase() as 'python' | 'r'}
                            fileName={basename(image.starterCodePath)}
                        />
                    ) : (
                        <LoadingMessage message="Loading starter code..." />
                    )}
                </AppModal>
            </Table.Td>
        </Table.Tr>
    )
}

const CodeEnvsTable: React.FC<{ images: CodeEnv[] }> = ({ images }) => {
    if (!images.length) {
        return (
            <Text fz="sm" c="dimmed" ta="center" p="md">
                No code environments available.
            </Text>
        )
    }

    // Count non-testing images per language
    const nonTestImageCountByLanguage = images.reduce(
        (acc, img) => {
            if (!img.isTesting) {
                acc[img.language] = (acc[img.language] || 0) + 1
            }
            return acc
        },
        {} as Record<string, number>,
    )

    return (
        <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Language</Table.Th>
                    <Table.Th>URL</Table.Th>
                    <Table.Th>Command Line</Table.Th>
                    <Table.Th>Starter Code</Table.Th>
                    <Table.Th>Sample Data</Table.Th>
                    <Table.Th>Is Testing</Table.Th>
                    <Table.Th>Env Vars</Table.Th>
                    <Table.Th>Created At</Table.Th>
                    <Table.Th>Actions</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {images.map((image, key) => {
                    const canDelete = image.isTesting || (nonTestImageCountByLanguage[image.language] || 0) > 1
                    return <CodeEnvRow key={key} image={image} canDelete={canDelete} />
                })}
            </Table.Tbody>
        </Table>
    )
}

export const CodeEnvs: React.FC = () => {
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const queryClient = useQueryClient()

    const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false)

    const {
        data: codeEnvs,
        isLoading,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: ['orgCodeEnvs', orgSlug],
        queryFn: async () => await fetchOrgCodeEnvsAction({ orgSlug }),
    })

    const handleFormComplete = () => {
        closeAddModal()
        queryClient.invalidateQueries({ queryKey: ['orgCodeEnvs', orgSlug] })
    }

    return (
        <Paper bg="white" p="xxl">
            <Stack>
                <Group justify="space-between" align="center">
                    <Title order={3} size="lg">
                        Code Environments
                    </Title>
                    <Button leftSection={<PlusCircleIcon size={16} />} onClick={openAddModal}>
                        Add Code Environment
                    </Button>
                </Group>
                <Divider c="dimmed" />

                {isLoading && <LoadingMessage message="Loading code environments" />}

                {isError && (
                    <ErrorPanel
                        title={`Failed to load code environments: ${error?.message || 'Unknown error'}`}
                        onContinue={refetch}
                    >
                        Retry
                    </ErrorPanel>
                )}

                {!isLoading && !isError && <CodeEnvsTable images={codeEnvs || []} />}
            </Stack>

            <AppModal isOpen={addModalOpened} onClose={closeAddModal} title="Add Code Environment">
                <CodeEnvForm onCompleteAction={handleFormComplete} />
            </AppModal>
        </Paper>
    )
}
