'use client'

import { useState } from 'react'
import { Table, Accordion, AccordionControl, AccordionPanel, AccordionItem, Flex, ActionIcon } from '@mantine/core'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { onFetchStudyRunsAction, onRunCreateAction } from './actions'
import { IconCodePlus, IconEditCircle } from '@tabler/icons-react'
import { PushInstructionsModal } from './push-instructions-modal'
import { AlertNotFound, ErrorAlert } from '@/components/errors'

export type Study = {
    id: string
    title: string
    containerLocation: string
    description: string
}

type RunsTableProps = {
    isActive: boolean
    study: Study
    //    onView(_: string): void
}

const RunsTable: React.FC<RunsTableProps> = ({ isActive, study }) => {
    const queryClient = useQueryClient()
    const [viewingRunId, setViewingRunId] = useState<string | null>(null)

    const { mutate: insertRun, error: insertError } = useMutation({
        mutationFn: () => onRunCreateAction(study.id),
        onSuccess: async (runId) => {
            setViewingRunId(runId)
            await queryClient.invalidateQueries({ queryKey: ['runsForStudy', study.id] })
        },
    })

    const { data: runs, isPending } = useQuery({
        queryKey: ['runsForStudy', study.id],
        enabled: isActive,
        queryFn: () => onFetchStudyRunsAction(study.id),
    })

    if (isPending) return <p>Loading...</p>

    return (
        <Table>
            <PushInstructionsModal
                containerLocation={study.containerLocation}
                runId={viewingRunId}
                onComplete={() => setViewingRunId(null)}
            />

            {insertError && (
                <Table.Caption>
                    <ErrorAlert error={insertError} />
                </Table.Caption>
            )}
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Requested</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th colSpan={2}>
                        <Flex justify="space-between">
                            <span>Completed</span>
                            <ActionIcon onClick={() => insertRun()} title="add run">
                                <IconCodePlus />
                            </ActionIcon>
                        </Flex>
                    </Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {(runs || []).map((run) => (
                    <Table.Tr key={run.id}>
                        <Table.Td>{run.createdAt.toISOString()}</Table.Td>
                        <Table.Td>{run.status}</Table.Td>
                        <Table.Td>{run.startedAt?.toISOString() || ''}</Table.Td>
                        <Table.Td align="right">
                            <ActionIcon title="view instructions" onClick={() => setViewingRunId(run.id)}>
                                <IconEditCircle />
                            </ActionIcon>
                        </Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    )
}

export const Panel: React.FC<{ studies: Study[] }> = ({ studies }) => {
    const [activeId, setActiveId] = useState<string | null>(null)

    if (!studies.length) {
        return (
            <AlertNotFound
                title="no studies"
                message={<p>There are no studies to display. Please create a study to get started.</p>}
            />
        )
    }

    return (
        <Accordion onChange={setActiveId}>
            {studies.map((study) => (
                <AccordionItem key={study.id} value={study.id} my="xl">
                    <AccordionControl>{study.title}</AccordionControl>
                    <AccordionPanel>
                        <p>{study.description}</p>
                        <RunsTable isActive={activeId == study.id} study={study} />
                    </AccordionPanel>
                </AccordionItem>
            ))}
        </Accordion>
    )
}
