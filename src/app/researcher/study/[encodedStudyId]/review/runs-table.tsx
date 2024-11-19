'use client'

import { useState, useEffect } from 'react'
import {
    Table,
    Accordion,
    AccordionControl,
    AccordionPanel,
    AccordionItem,
    Button,
    Modal,
    Text,
    Group,
    Center,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconPlus } from '@tabler/icons-react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { uuidToB64 } from '@/lib/uuid'
import { onFetchStudyRunsAction } from './actions'
import { humanizeStatus } from '@/lib/status'
import { AlertNotFound } from '@/components/errors'
import { getLatestStudyRunAction, onStudyRunCreateAction } from './actions'

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

const RunsTable: React.FC<RunsTableProps> = ({ encodedStudyId, isActive, study }) => {
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
    encodedStudyId = uuidToB64(study.id)
    const [_, setRun] = useState<{
        id: string
        title: string
        containerLocation: string
        memberName: string
        pendingRunId: string | null
    } | null>(null)

    useEffect(() => {
        const fetchRun = async () => {
            if (encodedStudyId) {
                const latestRun = await getLatestStudyRunAction({ encodedStudyId })
                if (latestRun) {
                    setRun(latestRun)
                }
            }
        }
        fetchRun()
    }, [encodedStudyId])

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
                                {run.status != 'INITIATED' && (
                                    <>
                                        <Group>
                                            <Modal opened={opened} onClose={close} title="AWS Instructions" centered>
                                                <Text>Instructions will go here!</Text>
                                                {/* <PushInstructions containerLocation={study.containerLocation} runId={study.pendingRunId} /> */}
                                            </Modal>
                                            <Button onClick={open}>View Instructions</Button>

                                            <Link href={`/researcher/study/run/${encodedStudyId}/review`}>
                                                <Button>View Results</Button>
                                            </Link>
                                        </Group>
                                    </>
                                )}
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
