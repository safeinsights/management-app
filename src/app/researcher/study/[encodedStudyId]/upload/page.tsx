import React from 'react'
import { Button, Flex, Text, Title, Container } from '@mantine/core'
import { getLatestStudyRunAction } from './actions'
import Link from 'next/link'
import { PushInstructions } from '@/components/push-instructions'
import { AlertNotFound } from '@/components/errors'

export default async function UploadPage(props: { params: Promise<{ encodedStudyId: string }> }) {
    const params = await props.params

    const { encodedStudyId } = params

    // TODO check user permissions
    const study = await getLatestStudyRunAction({ encodedStudyId })

    if (!study?.pendingRunId) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <Container w="100%">
            <Title mb="lg">OpenStax Study Proposal Step 2)</Title>
            <Text
                pt={10}
                fs="italic"
            >{`{ For the Pilot, communications steps and member review/approval are skipped }`}</Text>
            <Text mb="xl" mt="lg" fw="bold">
                For the Pilot, engineers use the following to containerize and upload code:
            </Text>
            <PushInstructions containerLocation={study.containerLocation} runId={study.pendingRunId} />
            <Flex justify="end" mt="lg">
                <Link href="edit" passHref>
                    <Button>Next</Button>
                </Link>
            </Flex>
        </Container>
    )
}
