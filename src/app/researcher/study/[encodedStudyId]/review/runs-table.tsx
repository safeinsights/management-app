'use client'

import { useState } from 'react'
import { Table, Accordion, AccordionControl, AccordionPanel, AccordionItem, Button } from '@mantine/core'
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
    studyIdentifier: string
    isActive: boolean
    study: Study
}

const RunsTable: React.FC<RunsTableProps> = ({  isActive, study }) => {
    const { data: runs, isPending } = useQuery({
        queryKey: ['runsForStudy', study.id],
        enabled: isActive,
        queryFn: () => onFetchStudyRunsAction(study.id),
    })

    if (isPending) return <p>Loading...</p>

    return (
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
                                <Link
                                    href={`/researcher/study/${study.id}/${uuidToB64(run.id)}/review`}
                                >
                                    <Button>View Code</Button>
                                </Link>
                            )}
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
                        <RunsTable isActive={activeId == study.id} study={study} studyIdentifier={study.id} />
                    </AccordionPanel>
                </AccordionItem>
            ))}
        </Accordion>
    )
}
