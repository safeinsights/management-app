import React from 'react'
import { Button, Flex, Text, Title, Container } from '@mantine/core'
import { getLatestStudyJobAction } from './actions'
import Link from 'next/link'
import { UploadStudyJobCode } from '@/components/upload-study-job-code'
import { AlertNotFound } from '@/components/errors'
import { getUploadUrlForStudyJobCodeAction } from './actions'

export default async function UploadPage(props: { params: Promise<{ studyId: string }> }) {
    const params = await props.params

    const { studyId } = params

    // TODO check user permissions
    const study = await getLatestStudyJobAction(studyId)

    if (!study?.pendingJobId) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <Container w="100%">
            <Title mb="lg">{study.memberName} Study Proposal Step 2)</Title>
            <Text
                pt={10}
                fs="italic"
            >{`{ For the Pilot, communications steps and member review/approval are skipped }`}</Text>

            <UploadStudyJobCode
                job={{ memberIdentifier: study.memberIdentifier, studyId: study.id, studyJobId: study.pendingJobId }}
                getSignedURL={getUploadUrlForStudyJobCodeAction}
            />
            <Flex justify="end" mt="lg">
                <Link href="edit" passHref>
                    <Button>Next</Button>
                </Link>
            </Flex>
        </Container>
    )
}
