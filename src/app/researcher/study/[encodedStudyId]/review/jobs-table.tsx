'use client'

import { FC, useState } from 'react'
import {
    Accordion,
    AccordionControl,
    AccordionItem,
    AccordionPanel,
    Button,
    Center,
    Group,
    Modal,
    Table,
} from '@mantine/core'
import { PushInstructions } from '@/components/push-instructions'
import { Plus } from '@phosphor-icons/react/dist/ssr'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { onFetchStudyJobsAction, onStudyJobCreateAction } from './actions'
import { humanizeStatus } from '@/lib/status'
import { AlertNotFound } from '@/components/errors'
import { PreviewCSVResultsBtn } from './results'
import { Study } from '@/schema/study'

type JobsTableProps = {
    encodedStudyId: string
    isActive: boolean
    study: Study
}

export const JobsTable: FC<JobsTableProps> = ({ isActive, study }) => {
    const queryClient = useQueryClient()
    const [openedJobId, setOpened] = useState<string | false>(false)

    const { mutate: insertJob } = useMutation({
        mutationFn: () => onStudyJobCreateAction(study.id),
        onSuccess: async (jobId) => {
            setOpened(jobId)
            await queryClient.invalidateQueries({ queryKey: ['jobsForStudy', study.id] })
        },
    })

    const { data: jobs, isPending } = useQuery({
        queryKey: ['jobsForStudy', study.id],
        enabled: isActive,
        queryFn: () => onFetchStudyJobsAction(study.id),
    })

    if (isPending) return <p>Loading...</p>

    return (
        <>
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
                                <Group>
                                    {job.status == 'INITIATED' && (
                                        <>
                                            <Modal
                                                size={800}
                                                opened={!!openedJobId}
                                                onClose={() => setOpened(false)}
                                                title="AWS Instructions"
                                                centered
                                            >
                                                <PushInstructions
                                                    containerLocation={study.containerLocation}
                                                    jobId={job.id}
                                                />
                                            </Modal>
                                            <Button onClick={() => setOpened(job.id)}>View Instructions</Button>
                                        </>
                                    )}
                                    {job.status == 'RUN-COMPLETE' && <PreviewCSVResultsBtn job={job} study={study} />}
                                </Group>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
            <Center mt="xl">
                <Button onClick={() => insertJob()} title="Create a new code run" leftSection={<Plus />}>
                    New Code Run
                </Button>
            </Center>
        </>
    )
}

export const Panel: FC<{ studies: Study[]; encodedStudyId: string }> = ({ studies, encodedStudyId }) => {
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
                        <JobsTable isActive={activeId == study.id} study={study} encodedStudyId={encodedStudyId} />
                    </AccordionPanel>
                </AccordionItem>
            ))}
        </Accordion>
    )
}
