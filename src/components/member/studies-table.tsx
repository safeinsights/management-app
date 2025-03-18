'use client'

import React, { FC } from 'react'
import { Member } from '@/schema/member'
import { Anchor, Paper, Stack, Table, Text, Title, Tooltip } from '@mantine/core'
import { fetchStudiesForMember } from '@/server/actions/study-actions'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { humanizeStatus } from '@/lib/status'
import Link from 'next/link'

export const StudiesTable: FC<{ member: Member }> = ({ member }) => {
    const { data: studies = [] } = useQuery({
        queryKey: ['studiesForMember', member.identifier],
        placeholderData: [],
        queryFn: () => {
            return fetchStudiesForMember(member.identifier)
        },
    })

    const rows = studies.map((study) => (
        <Table.Tr key={study.id}>
            <Table.Td>
                <Tooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }}>
                        {study.title} {study.title} {study.title}
                    </Text>
                </Tooltip>
            </Table.Td>
            {/*<Table.Td>{study.title}</Table.Td>*/}
            <Table.Td>{dayjs(study.createdAt).format('MMM DD, YYYY')}</Table.Td>
            <Table.Td>{study.researcherName}</Table.Td>
            {/* TODO Reviewed by doesn't exist yet */}
            {/*<Table.Td>{study.reviewedBy}</Table.Td>*/}
            <Table.Td>{humanizeStatus(study.status)}</Table.Td>
            <Table.Td>
                <Anchor component={Link} href={`/member/${member.identifier}/study/${study.id}/review`}>
                    View
                </Anchor>
            </Table.Td>
        </Table.Tr>
    ))

    return (
        <Paper shadow="xs" p="xl">
            <Stack gap="lg">
                <Title order={4}>Review Studies</Title>

                <Table layout="fixed" striped highlightOnHover withRowBorders>
                    {!rows.length && (
                        <Table.Caption>
                            <Text>You have no studies to review.</Text>
                        </Table.Caption>
                    )}

                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Study Name</Table.Th>
                            <Table.Th>Submitted On</Table.Th>
                            <Table.Th>Researcher</Table.Th>
                            {/* TODO Reviewed by */}
                            {/*<Table.Th>Reviewed By</Table.Th>*/}
                            <Table.Th>Status</Table.Th>
                            <Table.Th>Details</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>{rows}</Table.Tbody>
                </Table>
            </Stack>
        </Paper>
    )
}
