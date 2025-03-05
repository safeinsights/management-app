'use client'

import React from 'react'
import { Container, Flex, Button, Paper, Title, Group, Alert, Stack, Text, Tooltip, Table } from '@mantine/core'
import dayjs from 'dayjs'
import Link from 'next/link'
import { iconRightSpacing, studyRowHeaderStyle, statusBannerStyle } from '@/app/researcher/dashboard/styles.css'
import { Plus } from '@phosphor-icons/react/dist/ssr'
import { uuidToB64 } from '@/lib/uuid'
import { humanizeStatus } from '@/lib/status'

interface Study {
    id: string
    title: string
    piName: string
    status: string
    memberId: string
    createdAt: Date
}

interface StudiesTableProps {
    userName: string
    studies: Study[]
}

export function StudiesTable({ userName, studies }: StudiesTableProps) {
    return (
        <>
            <Container fluid>
                <Title>Hi, {userName}</Title>
                <Stack>
                    <Text mt="md">Welcome to SafeInsights</Text>
                    <Flex w="50%" wrap="wrap">
                        <Text>
                            We're so glad to have you. This space is intended to help you submit your proposed studies
                            and associated code, as well as accessing your analysis results—all while ensuring strict
                            data privacy and security. Your work plays a vital role in advancing educational research,
                            and we're committed to making this process as seamless as possible. We're continuously
                            refining the experience and value your feedback in shaping a more effective research
                            environment.
                        </Text>
                    </Flex>
                </Stack>
            </Container>

            <Paper m="xl" shadow="xs" p="xl">
                <Group justify="space-between">
                    <Title>Proposed Studies</Title>
                    <Flex justify="flex-end">
                        <Link href="/researcher/study/request/openstax">
                            <Button mt={30} mb={30}>
                                <Plus size={15} className={iconRightSpacing} /> Propose New Study
                            </Button>
                        </Link>
                    </Flex>
                </Group>
                <Table striped highlightOnHover>
                    <Table.Thead className={studyRowHeaderStyle}>
                        <Table.Tr>
                            <Table.Th>Study Name</Table.Th>
                            <Table.Th>Submitted On</Table.Th>
                            <Table.Th>Submitted To</Table.Th>
                            <Table.Th>Status</Table.Th>
                            <Table.Th>Study Details</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {studies.length > 0 ? (
                            studies.map((study) => (
                                <Table.Tr key={study.id}>
                                    <Table.Td>
                                        <Tooltip label={study.title}>
                                            <Text lineClamp={2} style={{ cursor: 'pointer', maxWidth: 150 }}>
                                                {study.title}
                                            </Text>
                                        </Tooltip>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text>{dayjs(study.createdAt).format('MMM DD, YYYY')}</Text>
                                    </Table.Td>
                                    <Table.Td>Review Team Name</Table.Td>
                                    <Table.Td>
                                        <Stack gap="xs">
                                            {humanizeStatus(study.status)}
                                            <Text fz={10} pl={8} c="dimmed" className={statusBannerStyle}>
                                                TBC
                                            </Text>
                                        </Stack>
                                    </Table.Td>
                                    <Table.Td>
                                        <Link
                                            style={{ textDecoration: 'underline' }}
                                            href={`/researcher/study/${uuidToB64(study.id)}/review`}
                                        >
                                            View
                                        </Link>
                                    </Table.Td>
                                </Table.Tr>
                            ))
                        ) : (
                            <Table.Tr>
                                <Table.Td colSpan={5} style={{ textAlign: 'center' }}>
                                    <Container p="xl" style={{ fontSize: '18px' }}>
                                        <Alert variant="transparent">
                                            You haven't started a study yet
                                            <Stack>
                                                <Link
                                                    style={{ textDecoration: 'underline' }}
                                                    href="/researcher/study/request/openstax"
                                                >
                                                    Propose New Study
                                                </Link>
                                            </Stack>
                                        </Alert>
                                    </Container>
                                </Table.Td>
                            </Table.Tr>
                        )}
                    </Table.Tbody>
                </Table>
            </Paper>
        </>
    )
}
