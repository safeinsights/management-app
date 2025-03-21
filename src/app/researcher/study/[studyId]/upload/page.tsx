import React from 'react'
import { Button, Flex, Title, Group } from '@mantine/core'
import { getLatestStudyJobAction } from './actions'
import Link from 'next/link'
import { UploadStudyJobCode } from '@/components/upload-study-job-code'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
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
        <>
            <ResearcherBreadcrumbs crumbs={{ current: 'Propose A Study' }} />
            <Title mb="lg">Propose A Study</Title>
            <UploadStudyJobCode
                job={{ memberIdentifier: study.memberIdentifier, studyId: study.id, studyJobId: study.pendingJobId }}
                getSignedURL={getUploadUrlForStudyJobCodeAction}
            />
            <Flex justify="end" mt="lg">
                <Group>
                    <Link href="/researcher/dashboard" passHref>
                        <Button fz="lg" color="#616161" variant="outline">
                            Cancel
                        </Button>
                    </Link>
                    <Link href="edit" passHref>
                        <Button color="#291bc4">Submit Proposal</Button>
                    </Link>
                </Group>
            </Flex>
        </>
    )
}
