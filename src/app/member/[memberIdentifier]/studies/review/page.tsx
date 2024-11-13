import React from 'react'
import { Alert, Flex, Paper, Title, Anchor } from '@mantine/core'
import { db } from '@/database'
import Link from 'next/link'
import { uuidToB64 } from '@/lib/uuid'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/members'
import { studyRowStyle, studyStatusStyle, studyTitleStyle } from './styles.css'
import { humanizeStatus } from '@/lib/status'
export const dynamic = 'force-dynamic'

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
        .orderBy('study.createdAt', 'desc')
        .select(['study.id', 'piName', 'status', 'title'])
        .where('study.status', '!=', 'INITIATED')
        .execute()

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <Title mb="lg">{member.name} Review Submitted Studies</Title>
            <Flex direction="column" gap="lg">
                {studies.length === 0 ? (
                    <Alert color="gray" title="No studies">
                        There are no studies to view at this time
                    </Alert>
                ) : (
                    <ul>
                        {studies.map((study) => (
                            <li key={study.id} className={studyRowStyle}>
                                <p className={studyTitleStyle}>{study.title}</p>
                                <p>{study.piName}</p>
                                <p className={studyStatusStyle}>{humanizeStatus(study.status)}</p>
                                <Link href={`/member/${memberIdentifier}/study/${uuidToB64(study.id)}/review`}>
                                    <Anchor>Proceed to review ≫</Anchor>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </Flex>
        </Paper>
    )
}
