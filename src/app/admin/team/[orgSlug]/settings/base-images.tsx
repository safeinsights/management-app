'use client'

import { Stack, Title, Divider, Paper, Text, Table, Button, Group } from '@mantine/core'
import { useQuery, useQueryClient, useMutation } from '@/common'
import { useParams } from 'next/navigation'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from '@/components/modal'
import { AddBaseImageForm } from './add-base-image-form'
import { TrashIcon, PlusCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { deleteOrgBaseImageAction, fetchOrgBaseImagesAction } from './base-images.actions'
import { SuretyGuard } from '@/components/surety-guard'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { ErrorPanel } from '@/components/panel'
import { LoadingMessage } from '@/components/loading'
import { ActionSuccessType } from '@/lib/types'

type BaseImage = ActionSuccessType<typeof fetchOrgBaseImagesAction>[number]

const BaseImageRow: React.FC<{ image: BaseImage; canDelete: boolean }> = ({ image, canDelete }) => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const queryClient = useQueryClient()

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
            <Table.Td>{image.name}</Table.Td>
            <Table.Td>{image.language}</Table.Td>
            <Table.Td>{image.baseImageUrl}</Table.Td>
            <Table.Td>{image.cmdLine}</Table.Td>
            <Table.Td>
                {image.skeletonCodeUrl ? (
                    <a href={image.skeletonCodeUrl} target="_blank" rel="noopener noreferrer">
                        Download
                    </a>
                ) : (
                    'N/A'
                )}
            </Table.Td>
            <Table.Td>{image.isTesting ? 'Yes' : 'No'}</Table.Td>
            <Table.Td>
                <DeleteBaseImg />
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

    const canDeleteNonTestImage = images.filter((img) => !img.isTesting).length > 1

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
                    <Table.Th>Actions</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {images.map((image, key) => (
                    <BaseImageRow key={key} image={image} canDelete={canDeleteNonTestImage} />
                ))}
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
                <AddBaseImageForm onCompleteAction={handleFormComplete} />
            </AppModal>
        </Paper>
    )
}
