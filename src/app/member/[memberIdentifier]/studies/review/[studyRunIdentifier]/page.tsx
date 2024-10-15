import React from 'react'
import { Button, Flex, Paper, Title } from '@mantine/core'
import { db } from '@/database'
import { b64toUUID } from '@/lib/uuid'

import Link from 'next/link'
import { Review } from './review'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/members'

export default async function UploadPage({
    params: { memberIdentifier, studyRunIdentifier },
}: {
    params: {
        memberIdentifier: string
        studyRunIdentifier: string
    }
}) {
    // TODO check user permissions
    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const run = await db
        .selectFrom('studyRun')
        .innerJoin('study', (join) => join.on('memberId', '=', member.id).onRef('study.id', '=', 'studyRun.studyId'))
        .select([
            'studyRun.id',
            'studyRun.codeReviewPath',
            'study.title as studyTitle',
            'studyRun.status',
            'study.dataSources',
            'study.outputMimeType',
        ])
        .where('studyRun.id', '=', b64toUUID(studyRunIdentifier))
        .executeTakeFirst()

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <Flex justify="space-between" align="center">
                <Title mb="lg">
                    {member.name} Review “{run?.studyTitle}”
                </Title>
                <Link href={`/member/${memberIdentifier}/studies/review`}>
                    <Button color="blue">Back to pending review</Button>
                </Link>
            </Flex>
            <Review memberIdentifier={memberIdentifier} run={run} />
        </Paper>
    )
}
