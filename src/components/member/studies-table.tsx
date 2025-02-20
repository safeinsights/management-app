'use client'

import React, { FC } from 'react'
import { Member } from '@/schema/member'
import { Stack, Table, Title, Text, Anchor, Center } from '@mantine/core'
import { fetchStudiesForMember } from '@/server/actions/study-actions'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { humanizeStatus } from '@/lib/status'
import Link from 'next/link'

export const StudiesTable: FC<{ member: Member }> = ({ member }) => {
    const { data: studies } = useQuery({
        queryKey: ['studiesForMember', member.identifier],
        initialData: [],
        queryFn: () => {
            return fetchStudiesForMember(member.identifier)
        },
    })

    const rows = studies.map((study) => (
        <Table.Tr key={study.id}>
            <Table.Td>{study.title}</Table.Td>
            <Table.Td>
                <Text>{dayjs(study.createdAt).format('MMM DD, YYYY')}</Text>
            </Table.Td>
            {/*TODO pull out researcher data from query?*/}
            <Table.Td>{study.researcherId}</Table.Td>
            {/*TODO Reviewed by*/}
            {/*<Table.Td>{study.reviewedBy}</Table.Td>*/}
            <Table.Td>{humanizeStatus(study.status)}</Table.Td>
            <Table.Td>
                <Anchor component={Link} href={`/studies/${study.id}`}>
                    View
                </Anchor>
            </Table.Td>
        </Table.Tr>
    ))

    return (
        <Stack gap="lg">
            <Title order={4}>Review Studies</Title>
            <Table layout="auto">
                <Table.Caption>{!rows.length && <Text>You have no studies to review.</Text>}</Table.Caption>

                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Study Name</Table.Th>
                        <Table.Th>Submitted On</Table.Th>
                        <Table.Th>Researcher</Table.Th>
                        {/*TODO Reviewed by*/}
                        {/*<Table.Th>Reviewed By</Table.Th>*/}
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Details</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{rows}</Table.Tbody>
            </Table>
        </Stack>
    )
}
