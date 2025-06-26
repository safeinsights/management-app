'use client'

import { Stack, Title, Divider, Paper, Text, Table, Button, Group, Modal } from '@mantine/core'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useDisclosure } from '@mantine/hooks'
import { AddBaseImageForm } from './add-base-image-form'
import { Trash, PlusCircle } from '@phosphor-icons/react/dist/ssr'
import { deleteOrgBaseImageAction, fetchOrgBaseImagesAction } from './base-images.actions'
import { SuretyGuard } from '@/components/surety-guard'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { ErrorPanel } from '@/components/panel'
import { LoadingMessage } from '@/components/loading'
import { ActionReturnType } from '@/lib/types'

type BaseImage = ActionReturnType<typeof fetchOrgBaseImagesAction>[number]

const BaseImageRow: React.FC<{ image: BaseImage }> = ({ image }) => {
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

    return (
        <Table.Tr>
            <Table.Td>{image.name}</Table.Td>
            <Table.Td>{image.language}</Table.Td>
            <Table.Td>{image.url}</Table.Td>
            <Table.Td>{image.isTesting ? 'Yes' : 'No'}</Table.Td>
            <Table.Td>
                <SuretyGuard
                    onConfirmed={() => deleteMutation.mutate({ imageId: image.id, orgSlug })}
                    message="Are you sure you want to delete this base image? This cannot be undone."
                >
                    <Trash />
                </SuretyGuard>
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

    return (
        <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Language</Table.Th>
                    <Table.Th>URL</Table.Th>
                    <Table.Th>Is Testing</Table.Th>
                    <Table.Th>Actions</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {images.map((image, key) => (
                    <BaseImageRow key={key} image={image} />
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
                        Base images for researcher code
                    </Title>
                    <Button leftSection={<PlusCircle size={16} />} onClick={openAddModal}>
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

            <Modal opened={addModalOpened} onClose={closeAddModal} title="Add New Base Image">
                <AddBaseImageForm onCompleteAction={handleFormComplete} />
            </Modal>
        </Paper>
    )
}
