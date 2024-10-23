import { Button, Flex, Paper, Title } from '@mantine/core'
import { db } from '@/database'
import { b64toUUID } from '@/lib/uuid'

import Link from 'next/link'
import { ReviewControls } from './review'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/members'

export default async function StudyReviewPage({
    params: { memberIdentifier, studyIdentifier },
}: {
    params: {
        memberIdentifier: string
        studyIdentifier: string
    }
}) {
    // TODO check user permissions
    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const study = await db
        .selectFrom('study')

        .select([
            'id',
            'title',
            'description',
            'status',
            'dataSources',
            'outputMimeType',
        ])
        .where('id', '=', b64toUUID(studyIdentifier))
        .executeTakeFirst()

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <Flex justify="space-between" align="center">
                <Title mb="lg">
                    {member.name} Review “{study.title}”
                </Title>
                <Flex gap="md" direction="column">
                    <ReviewControls study={study} memberIdentifier={memberIdentifier} />
                    <Link href={`/member/${memberIdentifier}/studies/review`}>
                        <Button color="blue">Back to pending review</Button>
                    </Link>
                </Flex>
            </Flex>
            <p>{study.description}</p>
        </Paper>
    )
}
