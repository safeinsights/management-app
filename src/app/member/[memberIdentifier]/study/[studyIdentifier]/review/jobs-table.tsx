'use client'

import { FC, useState } from 'react'
import { Accordion, AccordionControl, AccordionItem, AccordionPanel, Button, Table } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { uuidToB64 } from '@/lib/uuid'
import { onFetchStudyJobsAction } from './actions'
import Link from 'next/link'
import { humanizeStatus } from '@/lib/status'
import { AlertNotFound } from '@/components/errors'
import { Study } from '@/schema/study'

type JobsTableProps = {
    memberIdentifier: string
    isActive: boolean
    study: Study
}

export const JobsTable: FC<JobsTableProps> = ({ memberIdentifier, isActive, study }) => {
    const { data: jobs, isPending } = useQuery({
        queryKey: ['jobsForStudy', study.id],
        enabled: isActive,
        queryFn: () => onFetchStudyJobsAction(study.id),
    })

    if (isPending) return <p>Loading...</p>

    return (
        <Table verticalSpacing="md">
            <Table.Tbody>
                {(jobs || []).map((job, jobCount: number) => (
                    <Table.Tr key={job.id}>
                        <Table.Td>{jobCount + 1})</Table.Td>
                        <Table.Td>
                            Code Job Submitted On: {'{'}
                            {job.createdAt.toISOString()}
                            {'}'}
                        </Table.Td>
                        <Table.Td>|</Table.Td>
                        <Table.Td>
                            Status: {'{'}
                            {humanizeStatus(job.status)}
                            {'}'}
                        </Table.Td>
                        <Table.Td>{job.startedAt?.toISOString() || ''}</Table.Td>
                        <Table.Td align="right">
                            {job.status != 'INITIATED' && (
                                <Link
                                    href={`/member/${memberIdentifier}/study/${uuidToB64(study.id)}/job/${uuidToB64(job.id)}/review`}
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

export const Panel: FC<{ studies: Study[] }> = ({ studies }) => {
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
                        <JobsTable isActive={activeId == study.id} study={study} memberIdentifier={study.id} />
                    </AccordionPanel>
                </AccordionItem>
            ))}
        </Accordion>
    )
}
