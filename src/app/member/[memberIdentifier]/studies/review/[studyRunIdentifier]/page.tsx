import React from 'react'
import { Button, Flex, Paper, Title } from '@mantine/core'
import { db } from '@/database'
import { b64toUUID } from '@/lib/uuid'

import Link from 'next/link'

import { AlertNotFound } from '@/components/alerts'
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
            <AlertNotFound hideIf={!run} title="no run found" message="the run was not found" />
            {run && (
                <textarea
                    readOnly
                    style={{ width: '100%', height: 400, padding: 30 }}
                    defaultValue={`code for run ${run?.id} goes here or something...`}
                />
            )}
        </Paper>
    )
}
