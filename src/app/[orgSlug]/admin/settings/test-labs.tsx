'use client'

import { Stack, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { useParams } from 'next/navigation'
import { useDisclosure } from '@mantine/hooks'
import { errorToString } from '@/lib/errors'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { ErrorPanel } from '@/components/panel'
import { LoadingMessage } from '@/components/loading'
import { ActionSuccessType } from '@/lib/types'
import { AddTestLabModal } from './add-test-lab-modal'
import { designateTestLabsAction, fetchEligibleTestLabsAction, fetchOrgTestLabsAction } from './test-labs.actions'
import { TestLabRowView, TestLabsView } from './test-labs-view'

type TestLab = ActionSuccessType<typeof fetchOrgTestLabsAction>[number]

const TestLabsTable: React.FC<{ testLabs: TestLab[] }> = ({ testLabs }) => {
    if (!testLabs.length) {
        return (
            <Text fz="sm" c="dimmed" ta="center" p="md">
                No test labs have been added.
            </Text>
        )
    }

    return (
        <Stack gap={0}>
            {testLabs.map((lab) => (
                <TestLabRowView key={lab.id} name={lab.researchLabName} />
            ))}
        </Stack>
    )
}

const useTestLabs = (orgSlug: string) => {
    const queryClient = useQueryClient()
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)

    const designated = useQuery({
        queryKey: ['orgTestLabs', orgSlug],
        queryFn: async () => await fetchOrgTestLabsAction({ orgSlug }),
    })

    // Only while the modal is open: the full lab catalog is of no use to the section itself.
    const eligible = useQuery({
        queryKey: ['eligibleTestLabs', orgSlug],
        queryFn: async () => await fetchEligibleTestLabsAction({ orgSlug }),
        enabled: isModalOpen,
    })

    const designate = useMutation({
        mutationFn: async (researchLabIds: string[]) => await designateTestLabsAction({ orgSlug, researchLabIds }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['orgTestLabs', orgSlug] })
            await queryClient.invalidateQueries({ queryKey: ['eligibleTestLabs', orgSlug] })
            reportSuccess('Test labs were added successfully')
            closeModal()
        },
        onError: reportMutationError('Failed to add test labs'),
    })

    return { designated, eligible, designate, isModalOpen, openModal, closeModal }
}

export const TestLabs: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { designated, eligible, designate, isModalOpen, openModal, closeModal } = useTestLabs(orgSlug)

    if (!isVisible) return null

    return (
        <>
            <TestLabsView onAdd={openModal}>
                {designated.isLoading && <LoadingMessage message="Loading test labs" />}

                {designated.isError && (
                    <ErrorPanel
                        title={`Failed to load test labs: ${designated.error?.message || 'Unknown error'}`}
                        onContinue={designated.refetch}
                    >
                        Retry
                    </ErrorPanel>
                )}

                {!designated.isLoading && !designated.isError && <TestLabsTable testLabs={designated.data || []} />}
            </TestLabsView>

            <AddTestLabModal
                isOpen={isModalOpen}
                onClose={closeModal}
                labs={eligible.data || []}
                isLoading={eligible.isLoading}
                isSubmitting={designate.isPending}
                error={designate.error ? errorToString(designate.error) : null}
                onConfirm={designate.mutate}
            />
        </>
    )
}
