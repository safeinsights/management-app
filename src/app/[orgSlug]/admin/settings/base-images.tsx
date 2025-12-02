'use client'

import { Stack, Title, Divider, Paper, Text, Table, Button, Group, ActionIcon, Tooltip, Flex } from '@mantine/core'
import { useQuery, useQueryClient, useMutation } from '@/common'
import { useParams } from 'next/navigation'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from '@/components/modal'
import { BaseImageForm } from './base-image-form'
import { TrashIcon, PlusCircleIcon, PencilIcon, FileMagnifyingGlassIcon } from '@phosphor-icons/react/dist/ssr'
import { deleteOrgBaseImageAction, fetchOrgBaseImagesAction, fetchStarterCodeAction } from './base-images.actions'
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

type BaseImage = ActionSuccessType<typeof fetchOrgBaseImagesAction>[number]

const BaseImageRow: React.FC<{ image: BaseImage; canDelete: boolean }> = ({ image, canDelete }) => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const queryClient = useQueryClient()
    const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false)
    const [codeViewerOpened, { open: openCodeViewer, close: closeCodeViewer }] = useDisclosure(false)
    const [starterCode, setStarterCode] = useState<string | null>(null)
    const [isLoadingCode, setIsLoadingCode] = useState(false)

    const deleteMutation = useMutation({
        mutationFn: deleteOrgBaseImageAction,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['orgBaseImages', orgSlug],
            })
            reportSuccess('Base image was deleted successfully')
        },
        onError: reportMutationError('Failed to delete base image'),
    })

    const handleEditComplete = () => {
        closeEditModal()
        queryClient.invalidateQueries({ queryKey: ['orgBaseImages', orgSlug] })
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

    const DeleteBaseImg = () => {
        if (!canDelete) return null

        return (
            <SuretyGuard
                onConfirmed={() => deleteMutation.mutate({ imageId: image.id, orgSlug })}
                message="Are you sure you want to delete this base image? This cannot be undone."
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
                    {Object.entries((image.envVars as Record<string, string>) || {})
                        .map(([k, v]) => `${k}=${v}`)
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
                    <DeleteBaseImg />
                </Group>
                <AppModal isOpen={editModalOpened} onClose={closeEditModal} title="Edit Base Image">
                    <BaseImageForm image={image} onCompleteAction={handleEditComplete} />
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

const BaseImagesTable: React.FC<{ images: BaseImage[] }> = ({ images }) => {
    if (!images.length) {
        return (
            <Text fz="sm" c="dimmed" ta="center" p="md">
                No base images available.
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
                    <Table.Th>Is Testing</Table.Th>
                    <Table.Th>Env Vars</Table.Th>
                    <Table.Th>Created At</Table.Th>
                    <Table.Th>Actions</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {images.map((image, key) => {
                    // Testing images can always be deleted
                    // Non-testing images can only be deleted if there are multiple non-testing images for that language
                    const canDelete = image.isTesting || (nonTestImageCountByLanguage[image.language] || 0) > 1
                    return <BaseImageRow key={key} image={image} canDelete={canDelete} />
                })}
            </Table.Tbody>
        </Table>
    )
}

export const BaseImages: React.FC = () => {
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const queryClient = useQueryClient()

    const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false)

    const {
        data: baseImages,
        isLoading,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: ['orgBaseImages', orgSlug],
        queryFn: async () => await fetchOrgBaseImagesAction({ orgSlug }),
    })

    const handleFormComplete = () => {
        closeAddModal()
        queryClient.invalidateQueries({ queryKey: ['orgBaseImages', orgSlug] })
    }

    return (
        <Paper bg="white" p="xxl">
            <Stack>
                <Group justify="space-between" align="center">
                    <Title order={3} size="lg">
                        Base Research Container Images
                    </Title>
                    <Button leftSection={<PlusCircleIcon size={16} />} onClick={openAddModal}>
                        Add Image
                    </Button>
                </Group>
                <Divider c="dimmed" />

                {isLoading && <LoadingMessage message="Loading base images" />}

                {isError && (
                    <ErrorPanel
                        title={`Failed to load base images: ${error?.message || 'Unknown error'}`}
                        onContinue={refetch}
                    >
                        Retry
                    </ErrorPanel>
                )}

                {!isLoading && !isError && <BaseImagesTable images={baseImages || []} />}
            </Stack>

            <AppModal isOpen={addModalOpened} onClose={closeAddModal} title="Add New Base Image">
                <BaseImageForm onCompleteAction={handleFormComplete} />
            </AppModal>
        </Paper>
    )
}
