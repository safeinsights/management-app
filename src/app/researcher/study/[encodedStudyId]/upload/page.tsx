import React from 'react'
import { Button, Flex, Paper, Text } from '@mantine/core'
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
            <Text>{`{ For the Pilot, communications steps and member review/approval are skipped }`}</Text>

            <Text mb="xl">
                Below is a representation of the steps the Researcher‘s development team may need to containerize and
                upload their code
            </Text>

            <PushInstructions containerLocation={study.containerLocation} runId={study.pendingRunId} />

            <Flex justify="end" mt="lg">
                <Link href="edit" passHref>
                    <Button>Proceed</Button>
                </Link>
            </Flex>
        </Paper>
    )
}
