import React from 'react'
import { Alert, Anchor, Flex, Paper, Title } from '@mantine/core'
import Link from 'next/link'
import { uuidToB64 } from '@/lib/uuid'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { studyRowStyle, studyStatusStyle, studyTitleStyle } from './styles.css'
import { humanizeStatus } from '@/lib/status'
import { fetchStudiesForMember } from '@/server/actions/study-actions'

export const dynamic = 'force-dynamic'

export default async function StudyReviewPage(props: { params: Promise<{ memberIdentifier: string }> }) {
    const params = await props.params

    const { memberIdentifier } = params

    // TODO check user permissions
    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const studies = await fetchStudiesForMember(memberIdentifier)

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
                                    <Anchor component="span">Proceed to review ≫</Anchor>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </Flex>
        </Paper>
    )
}
