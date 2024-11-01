import React from 'react'
import { Alert, Button, Flex, Paper, Title, Table } from '@mantine/core'
import { db } from '@/database'

import Link from 'next/link'
import { uuidToB64 } from '@/lib/uuid'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/members'

export const dynamic = 'force-dynamic'

const StudyRuns: React.FC<{ study: { id: string }; memberIdentifier: string }> = async ({
    study,
    memberIdentifier,
}) => {
    const runs = await db
        .selectFrom('studyRun')
        .select(['id', 'uploadedAt', 'status'])

        .where('studyId', '=', study.id)
        .execute()

    return (
        <>
            <Table>
                <thead>
                    <tr>
                        <th align="left">Code Uploaded At</th>
                        <th align="left" colSpan={2}>
                            Status
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {runs.map((run) => (
                        <tr key={run.id}>
                            <td>{run.uploadedAt?.toLocaleDateString()}</td>
                            <td>{run.status}</td>
                            <td>
                                {run.status != 'initiated' && (
                                    <Link
                                        href={`/member/${memberIdentifier}/study/${uuidToB64(study.id)}/run/${uuidToB64(run.id)}/review`}
                                    >
                                        <Button color="blue">Review code</Button>
                                    </Link>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </>
    )
}

export default async function StudyReviewPage({
    params: { memberIdentifier },
}: {
    params: { memberIdentifier: string }
}) {
    // TODO check user permissions
    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const studies = await db
        .selectFrom('study')
        .innerJoin('member', (join) =>
            join.on('member.identifier', '=', memberIdentifier).onRef('study.memberId', '=', 'member.id'),
        )

        .select(['study.id', 'study.createdAt', 'study.title', 'study.description'])
        .where('study.status', '=', 'initiated')
        .execute()

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <Title mb="lg">{member.name} Review Pending Studies</Title>
            <Flex direction="column" gap="lg">
                {studies.length === 0 ? (
                    <Alert color="gray" title="No pending studies">
                        There are no pending studies to review at this time
                    </Alert>
                ) : (
                    studies.map((study) => (
                        <Paper key={study.id} p="lg" shadow="xs">
                            <Flex justify="space-between">
                                <Title order={3}>{study.title}</Title>
                                <Link href={`/member/${memberIdentifier}/study/${uuidToB64(study.id)}/review`}>
                                    <Button color="blue">Review study</Button>
                                </Link>
                            </Flex>
                            <StudyRuns study={study} memberIdentifier={memberIdentifier} />
                        </Paper>
                    ))
                )}
            </Flex>
        </Paper>
    )
}
