'use client'

import { Stack, Title, Divider, Paper, Text, Button, Group } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from '@/components/modal'
import { PlusCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { AddStarterCodeForm } from './add-starter-code-form'
import { StarterCodeTable } from './starter-code-table'
import { useQuery, useQueryClient } from '@/common'
import { useParams } from 'next/navigation'
import { fetchStarterCodesAction } from './starter-code.actions'
import { LoadingMessage } from '@/components/loading'
import { ErrorPanel } from '@/components/panel'

export const StarterCode: React.FC = () => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const queryClient = useQueryClient()
    const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false)

    const {
        data: starterCodes,
        isLoading,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: ['starterCodes', orgSlug],
        queryFn: async () => await fetchStarterCodesAction({ orgSlug }),
    })

    const handleFormComplete = () => {
        closeAddModal()
        queryClient.invalidateQueries({ queryKey: ['starterCodes', orgSlug] })
    }

    return (
        <Paper bg="white" p="xxl">
            <Stack>
                <Group justify="space-between" align="center">
                    <Stack gap={0}>
                        <Title order={3} size="lg">
                            Starter Code
                        </Title>
                        <Text c="dimmed" fz="sm">
                            Upload starter code to assist Researchers with their coding experience. SafeInsights will
                            include this when Researchers use the SafeInsights IDE
                        </Text>
                    </Stack>
                    <Button leftSection={<PlusCircleIcon size={16} />} onClick={openAddModal}>
                        Add Code
                    </Button>
                </Group>
                <Divider c="dimmed" />

                {isLoading && <LoadingMessage message="Loading starter codes" />}

                {isError && (
                    <ErrorPanel
                        title={`Failed to load starter codes: ${error?.message || 'Unknown error'}`}
                        onContinue={refetch}
                    >
                        Retry
                    </ErrorPanel>
                )}

                {!isLoading && !isError && <StarterCodeTable starterCodes={starterCodes || []} />}
            </Stack>

            <AppModal isOpen={addModalOpened} onClose={closeAddModal} title="Add starter code">
                <AddStarterCodeForm onCompleteAction={handleFormComplete} />
            </AppModal>
        </Paper>
    )
}
