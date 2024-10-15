import React from 'react'
import { Alert, Button, Flex, Paper, Title } from '@mantine/core'
import { getPendingStudyRunAction } from './actions'
import Link from 'next/link'
import { PushInstructions } from '@/components/push-instructions'
import { AlertNotFound } from '@/components/errors'

export default async function UploadPage({ params: { encodedStudyId } }: { params: { encodedStudyId: string } }) {
    // TODO check user permissions
    const study = await getPendingStudyRunAction({ encodedStudyId })

    if (!study?.pendingRunId) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <Title mb="lg">{study.memberName} Study Proposal Step 2)</Title>

            <Alert color="blue" title="Steps have been skipped" mb="lg">
                Communication with member
            </Alert>

            <PushInstructions containerLocation={study.containerLocation} runId={study.pendingRunId} />

            <Title my="lg" order={3}>
                Once you have pushed your image, proceed to complete and submit your research proposal.
            </Title>
            <Flex justify="end" mt="lg">
                <Link href="edit" passHref>
                    <Button>Proceed</Button>
                </Link>
            </Flex>
        </Paper>
    )
}
