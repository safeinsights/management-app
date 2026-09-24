'use client'

import { useMutation, useQuery, useQueryClient } from '@/common'
import { useParams } from 'next/navigation'
import { useDisclosure } from '@mantine/hooks'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { SuretyGuard } from '@/components/surety-guard'
import { useSpyMode } from '@/components/spy-mode-context'
import { useSession } from '@/hooks/session'
import { ActionSuccessType } from '@/lib/types'
import { formatInstant } from '@/lib/dates'
import { AddTestLabModal, type EligibleLab } from './add-test-lab-modal'
import { QueryStateBody } from './query-state-body'
import {
    designateTestLabsAction,
    fetchEligibleTestLabsAction,
    fetchOrgTestLabsAction,
    undesignateTestLabAction,
} from './test-labs.actions'
import { TestLabRowView, TestLabsEmptyView, TestLabsTableView, TestLabsView } from './test-labs-view'

type TestLab = ActionSuccessType<typeof fetchOrgTestLabsAction>[number]

// Module-level, so a render that has no data yet does not mint a new array identity each time.
const NO_LABS: TestLab[] = []
const NO_ELIGIBLE: EligibleLab[] = []

const DROP_MESSAGE = 'Drop this test lab? Studies it already submitted stay test studies.'

type OnDrop = (testLabId: string) => void

const DropTestLabButton: React.FC<{ name: string; onConfirmed: () => void }> = ({ name, onConfirmed }) => (
    <SuretyGuard label={`Drop ${name}`} message={DROP_MESSAGE} onConfirmed={onConfirmed} />
)

const TestLabRow: React.FC<{ lab: TestLab; hasActions: boolean; onDrop: OnDrop }> = ({ lab, hasActions, onDrop }) => {
    const onConfirmed = () => onDrop(lab.id)

    return (
        <TestLabRowView
            name={lab.researchLabName}
            addedOn={formatInstant(lab.createdAt)}
            hasActions={hasActions}
            actions={<DropTestLabButton name={lab.researchLabName} onConfirmed={onConfirmed} />}
        />
    )
}

type TestLabsTableProps = { testLabs: TestLab[]; hasActions: boolean; onDrop: OnDrop }

const TestLabsTable: React.FC<TestLabsTableProps> = ({ testLabs, hasActions, onDrop }) => {
    if (!testLabs.length) return <TestLabsEmptyView />

    return (
        <TestLabsTableView hasActions={hasActions}>
            {testLabs.map((lab) => (
                <TestLabRow key={lab.id} lab={lab} hasActions={hasActions} onDrop={onDrop} />
            ))}
        </TestLabsTableView>
    )
}

// Spy mode is a client-side toggle anyone can flip, and the action admits SI admins only, so the
// button stays hidden from everyone else rather than being shown only to fail.
const useCanDropTestLabs = () => {
    const { isSpyMode } = useSpyMode()
    const { session } = useSession()

    return isSpyMode && Boolean(session?.user.isSiAdmin)
}

const useTestLabs = (orgSlug: string, isVisible: boolean) => {
    const queryClient = useQueryClient()
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)

    // The action refuses a lab org by design; without this the query still fires and retries.
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

    const undesignate = useMutation({
        mutationFn: async (testLabId: string) => await undesignateTestLabAction({ orgSlug, testLabId }),
        onSuccess: () => reportSuccess('Test lab was dropped'),
        onError: reportMutationError('Failed to drop test lab'),
        // On failure too, so a row another admin already dropped leaves the table.
        onSettled: async () => {
            await queryClient.invalidateQueries({ queryKey: ['orgTestLabs', orgSlug] })
            await queryClient.invalidateQueries({ queryKey: ['eligibleTestLabs', orgSlug] })
        },
    })

    return { designated, eligible, designate, undesignate, isModalOpen, openModal, closeModal }
}

export const TestLabs: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { designated, eligible, designate, undesignate, isModalOpen, openModal, closeModal } = useTestLabs(
        orgSlug,
        isVisible,
    )
    const canDrop = useCanDropTestLabs()

    if (!isVisible) return null

    return (
        <>
            <TestLabsView onAdd={openModal}>
                <QueryStateBody query={designated} loadingMessage="Loading test labs" errorLabel="test labs">
                    <TestLabsTable
                        testLabs={designated.data ?? NO_LABS}
                        hasActions={canDrop}
                        onDrop={undesignate.mutate}
                    />
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
