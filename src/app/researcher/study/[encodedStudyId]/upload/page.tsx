import React from 'react'
import { Button, Flex, Text, Title, Container } from '@mantine/core'
import { getLatestStudyJobAction } from './actions'
import Link from 'next/link'
import { UploadStudyJobCode } from '@/components/upload-study-job-code'
import { AlertNotFound } from '@/components/errors'
import { getUploadUrlForStudyJobCodeAction } from './actions'

export default async function UploadPage(props: { params: Promise<{ encodedStudyId: string }> }) {
    const params = await props.params

    const { encodedStudyId } = params

    // TODO check user permissions
    const study = await getLatestStudyJobAction({ encodedStudyId })

    if (!study?.pendingJobId) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <>
            <Title mb="lg">Propose A Study</Title>
            <UploadStudyJobCode
                job={{ memberIdentifier: study.memberIdentifier, studyId: study.id, studyJobId: study.pendingJobId }}
                getSignedURL={getUploadUrlForStudyJobCodeAction}
            />
            <Flex justify="end" mt="lg">
                <Link href="edit" passHref>
                    <Button>Next</Button>
                </Link>
            </Flex>
        </>
    )
}
