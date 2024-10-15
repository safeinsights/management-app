import React from 'react'
import { Alert, Button, Flex, Paper, Title } from '@mantine/core'
import { db } from '@/database'

import Link from 'next/link'
import { uuidToB64 } from '@/lib/uuid'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/members'

export default async function UploadPage({ params: { memberIdentifier } }: { params: { memberIdentifier: string } }) {
    // TODO check user permissions
    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const pendingRuns = await db
        .selectFrom('studyRun')
        .innerJoin('study', (join) => join.on('memberId', '=', member.id).onRef('study.id', '=', 'studyRun.studyId'))
        .select([
            'studyRun.id',
            'studyId',
            'studyRun.createdAt as requestedAt',
            'studyRun.codeReviewPath',
            'study.title',
            'studyRun.status',
            'study.dataSources',
            'study.outputMimeType',
        ])
        .where('studyRun.status', '=', 'created')
        .execute()

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <Title mb="lg">{member.name} Review Pending Studies</Title>
            <Flex direction="column" gap="lg">
                {pendingRuns.length === 0 ? (
                    <Alert color="gray" title="No pending studies">
                        There are no pending studies to review at this time
                    </Alert>
                ) : (
                    pendingRuns.map((run) => (
                        <Paper key={run.id} p="lg" shadow="xs">
                            <Title order={3}>{run.title}</Title>
                            <Flex direction="column" gap="lg">
                                <Flex>
                                    <Title order={4}>Requested at:</Title>
                                    <Title order={4}>{run.requestedAt.toLocaleString()}</Title>
                                </Flex>
                                <Flex>
                                    <Title order={4}>Data sources:</Title>
                                    <Title order={4}>{run.dataSources.join(', ')}</Title>
                                </Flex>
                                <Flex>
                                    <Title order={4}>Output format:</Title>
                                    <Title order={4}>{run.outputMimeType}</Title>
                                </Flex>
                                <Flex>
                                    <Title order={4}>Code review:</Title>
                                </Flex>
                                <Flex>
                                    <Link href={`/member/${memberIdentifier}/studies/review/${uuidToB64(run.id)}`}>
                                        <Button color="blue">Review study</Button>
                                    </Link>
                                </Flex>
                            </Flex>
                        </Paper>
                    ))
                )}
            </Flex>
        </Paper>
    )
}
