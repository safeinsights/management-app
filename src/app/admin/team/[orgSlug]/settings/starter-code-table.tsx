'use client'

import { Table, Button, Text } from '@mantine/core'
import { TrashIcon, DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { useMutation, useQueryClient } from '@/common'
import { useParams } from 'next/navigation'
import { deleteStarterCodeAction, downloadStarterCodeAction, fetchStarterCodesAction } from './starter-code.actions'
import { SuretyGuard } from '@/components/surety-guard'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { ActionSuccessType } from '@/lib/types'

type StarterCode = ActionSuccessType<typeof fetchStarterCodesAction>[number]

const StarterCodeRow: React.FC<{ starterCode: StarterCode }> = ({ starterCode }) => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const queryClient = useQueryClient()

    const deleteMutation = useMutation({
        mutationFn: deleteStarterCodeAction,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['starterCodes', orgSlug],
            })
            reportSuccess('Starter code was deleted successfully')
        },
        onError: reportMutationError('Failed to delete starter code'),
    })

    const downloadMutation = useMutation({
        mutationFn: downloadStarterCodeAction,
        onSuccess: (data) => {
            // Create a download link
            const url = data.url
            const link = document.createElement('a')
            link.href = url
            link.download = starterCode.name
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        },
        onError: reportMutationError('Failed to download starter code'),
    })

    const handleDownload = () => {
        downloadMutation.mutate({ id: starterCode.id, orgSlug })
    }

    return (
        <Table.Tr>
            <Table.Td>{starterCode.name}</Table.Td>
            <Table.Td>{starterCode.language}</Table.Td>
            <Table.Td>
                <Button
                    variant="subtle"
                    size="xs"
                    leftSection={<DownloadSimpleIcon />}
                    onClick={handleDownload}
                    loading={downloadMutation.isPending}
                >
                    {starterCode.name}
                </Button>
            </Table.Td>
            <Table.Td>
                <SuretyGuard
                    onConfirmed={() => deleteMutation.mutate({ id: starterCode.id, orgSlug })}
                    message="Are you sure you want to delete this starter code? This cannot be undone."
                >
                    <TrashIcon />
                </SuretyGuard>
            </Table.Td>
        </Table.Tr>
    )
}

export const StarterCodeTable: React.FC<{ starterCodes: StarterCode[] }> = ({ starterCodes }) => {
    if (!starterCodes.length) {
        return (
            <Text fz="sm" c="dimmed" ta="center" p="md">
                No starter code available.
            </Text>
        )
    }

    return (
        <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Language</Table.Th>
                    <Table.Th>File</Table.Th>
                    <Table.Th>Actions</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {starterCodes.map((starterCode) => (
                    <StarterCodeRow key={starterCode.id} starterCode={starterCode} />
                ))}
            </Table.Tbody>
        </Table>
    )
}
