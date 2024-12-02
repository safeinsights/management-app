'use client'

import { useState } from 'react'
import {
    Table,
    Accordion,
    AccordionControl,
    AccordionPanel,
    AccordionItem,
    Button,
    Modal,
    Group,
    Center,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { PushInstructions } from '@/components/push-instructions'
import { IconPlus } from '@tabler/icons-react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { onFetchStudyRunsAction } from './actions'
import { humanizeStatus } from '@/lib/status'
import { AlertNotFound } from '@/components/errors'
import { onStudyRunCreateAction } from './actions'
import { PreviewCSVResultsBtn } from './results'

export type Study = {
    id: string
    title: string
    containerLocation: string
    description: string
    pendingRunId?: string
}

type RunsTableProps = {
    encodedStudyId: string
    isActive: boolean
    study: Study
}

const RunsTable: React.FC<RunsTableProps> = ({ isActive, study }) => {
    const queryClient = useQueryClient()
    const [__, setViewingRunId] = useState<string | null>(null)

    const { mutate: insertRun } = useMutation({
        mutationFn: () => onStudyRunCreateAction(study.id),
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

    const [opened, { open, close }] = useDisclosure(false)

    if (isPending) return <p>Loading...</p>

    return (
        <>
            <Table verticalSpacing="md">
                <Table.Tbody>
                    {(runs || []).map((run, runCount: number) => (
                        <Table.Tr key={run.id}>
                            <Table.Td>{runCount + 1})</Table.Td>
                            <Table.Td>
                                Code Run Submitted On: {'{'}
                                {run.createdAt.toISOString()}
                                {'}'}
                            </Table.Td>
                            <Table.Td>|</Table.Td>
                            <Table.Td>
                                Status: {'{'}
                                {humanizeStatus(run.status)}
                                {'}'}
                            </Table.Td>
                            <Table.Td>{run.startedAt?.toISOString() || ''}</Table.Td>
                            <Table.Td align="right">
                                <Group>
                                        <>
                                            <Modal
                                                size={800}
                                                opened={opened}
                                                onClose={close}
                                                title="AWS Instructions"
                                                centered
                                            >
                                                <PushInstructions
                                                    containerLocation={study.containerLocation}
                                                    runId={run.id}
                                                />
                                            </Modal>
                                            <Button onClick={open}>View Instructions</Button>
                                        </>
                                    {run.status == 'COMPLETED' && <PreviewCSVResultsBtn run={run} />}
                                </Group>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
            <Center mt="xl">
                <Button onClick={() => insertRun()} title="Create a new code run" leftSection={<IconPlus size={14} />}>
                    New Code Run
                </Button>
            </Center>
        </>
    )
}

export { RunsTable }
export const Panel: React.FC<{ studies: Study[]; encodedStudyId: string }> = ({ studies, encodedStudyId }) => {
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
                        <RunsTable isActive={activeId == study.id} study={study} encodedStudyId={encodedStudyId} />
                    </AccordionPanel>
                </AccordionItem>
            ))}
        </Accordion>
    )
}
