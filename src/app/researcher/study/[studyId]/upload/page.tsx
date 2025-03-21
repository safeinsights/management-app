import React from 'react'
import { Button, Flex, Group, Title } from '@mantine/core'
import Link from 'next/link'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { AlertNotFound } from '@/components/errors'
import { getLatestStudyJobAction } from '@/server/actions/study-job-actions'

// TODO Delete me?
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
            {/*<UploadStudyJobCode*/}
            {/*    job={{ memberIdentifier: study.memberIdentifier, studyId: study.id, studyJobId: study.pendingJobId }}*/}
            {/*/>*/}
            <Flex justify="end" mt="lg">
                <Group>
                    <Button component={Link} href="/researcher/dashboard" fz="lg" color="#616161" variant="outline">
                        Cancel
                    </Button>
                    <Button color="#291bc4">Submit Proposal</Button>
                </Group>
            </Flex>
        </>
    )
}
