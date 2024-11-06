'use client'

import { useState } from 'react'
import { Table, Accordion, AccordionControl, AccordionPanel, AccordionItem, Flex, ActionIcon, Button } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { uuidToB64 } from '@/lib/uuid'
import { onFetchStudyRunsAction } from './actions'
import Link from 'next/link'
import { humanizeStatus } from '@/lib/status'
import { AlertNotFound } from '@/components/errors'

export type Study = {
    id: string
    title: string
    containerLocation: string
    description: string
}

type RunsTableProps = {
    memberIdentifier: string
    isActive: boolean
    study: Study
}

const RunsTable: React.FC<RunsTableProps> = ({ memberIdentifier, isActive, study }) => {


    const { data: runs, isPending } = useQuery({
        queryKey: ['runsForStudy', study.id],
        enabled: isActive,
        queryFn: () => onFetchStudyRunsAction(study.id),
    })

    if (isPending) return <p>Loading...</p>

    return (
        <Table>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Requested</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th colSpan={2}>
                        <Flex justify="space-between">
                            <span>Completed</span>

                        </Flex>
                    </Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {(runs || []).map((run) => (
                    <Table.Tr key={run.id}>
                        <Table.Td>{run.createdAt.toISOString()}</Table.Td>
                        <Table.Td>{humanizeStatus(run.status)}</Table.Td>
                        <Table.Td>{run.startedAt?.toISOString() || ''}</Table.Td>
                        <Table.Td align="right">
                            <Link href={`/member/${memberIdentifier}/study/${uuidToB64(study.id)}/run/${uuidToB64(run.id)}/review`}>
                                <Button>view code</Button>
                            </Link>
                        </Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    )
}

export { RunsTable }
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