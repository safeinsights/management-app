import { Button, Flex, Paper, Title } from '@mantine/core'
import { db } from '@/database'
import { b64toUUID } from '@/lib/uuid'

import Link from 'next/link'

import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/members'

export default async function StudyReviewPage({
    params: { memberIdentifier, studyRunIdentifier },
}: {
    params: {
        memberIdentifier: string
        studyIdentifier: string
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
        .innerJoin('study', 'study.id', 'studyRun.studyId')
        .select([
            'studyRun.id',
            'study.title as studyTitle',
            'studyRun.codePath',
            'studyRun.uploadedAt',
        ])
        .where('studyRun.id', '=', b64toUUID(studyRunIdentifier))
        .executeTakeFirst()

    if (!run) {
        return <AlertNotFound title="StudyRun was not found" message="no such study run exists" />
    }

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <Flex justify="space-between" align="center">
                <Title mb="lg">
                    {member.name} Review code for “{run.studyTitle}”
                </Title>
                <Flex gap="md" direction="column">

                    <Link href={`/member/${memberIdentifier}/studies/review`}>
                        <Button color="blue">Back to pending review</Button>
                    </Link>
                </Flex>
            </Flex>
            <textarea
                readOnly
                style={{ width: '100%', height: 400, padding: 30 }}
                defaultValue={`code for run ${run.id} goes here or something...`}
            />
        </Paper>
    )
}
