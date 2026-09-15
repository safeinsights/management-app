'use client'

import { Stack, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { useParams } from 'next/navigation'
import { useDisclosure } from '@mantine/hooks'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { ActionSuccessType } from '@/lib/types'
import { AddTestLabModal, type EligibleLab } from './add-test-lab-modal'
import { QueryStateBody } from './query-state-body'
import { designateTestLabsAction, fetchEligibleTestLabsAction, fetchOrgTestLabsAction } from './test-labs.actions'
import { TestLabRowView, TestLabsView } from './test-labs-view'

type TestLab = ActionSuccessType<typeof fetchOrgTestLabsAction>[number]

// Module-level, so a render that has no data yet does not mint a new array identity each time.
const NO_LABS: TestLab[] = []
const NO_ELIGIBLE: EligibleLab[] = []

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

const useTestLabs = (orgSlug: string, isVisible: boolean) => {
    const queryClient = useQueryClient()
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)

    // A lab org renders nothing, and the action refuses one by design; without this the query
    // still fires and retries.
    const designated = useQuery({
        queryKey: ['orgTestLabs', orgSlug],
        queryFn: async () => await fetchOrgTestLabsAction({ orgSlug }),
        enabled: isVisible,
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
    const { designated, eligible, designate, isModalOpen, openModal, closeModal } = useTestLabs(orgSlug, isVisible)

    if (!isVisible) return null

    return (
        <>
            <TestLabsView onAdd={openModal}>
                <QueryStateBody query={designated} loadingMessage="Loading test labs" errorLabel="test labs">
                    <TestLabsTable testLabs={designated.data ?? NO_LABS} />
                </QueryStateBody>
            </TestLabsView>

            <AddTestLabModal
                isOpen={isModalOpen}
                onClose={closeModal}
                labs={eligible.data ?? NO_ELIGIBLE}
                isLoading={eligible.isLoading}
                isSubmitting={designate.isPending}
                error={designate.error}
                onConfirm={designate.mutate}
            />
        </>
    )
}
