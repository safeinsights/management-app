import { Box, Container, Divider, Flex, Grid, GridCol, Stack, Text, Title } from '@mantine/core'
import { b64toUUID } from '@/lib/uuid'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { MemberBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction } from '@/server/actions/study-actions'
import React from 'react'
import { ReviewControls } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/review'

export default async function StudyReviewPage(props: {
    params: Promise<{
        memberIdentifier: string
        studyIdentifier: string
    }>
}) {
    const params = await props.params

    const { memberIdentifier, studyIdentifier } = params

    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const study = await getStudyAction(b64toUUID(studyIdentifier))

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <Stack px="xl">
            <Stack>
                <MemberBreadcrumbs
                    crumbs={{
                        memberIdentifier,
                        current: study.title,
                    }}
                />
                <Title>Study details</Title>
            </Stack>

            <Stack>
                <ReviewControls study={study} memberIdentifier={memberIdentifier} />
                <Divider />
                <Grid>
                    <GridCol span={3}>
                        <Stack>
                            <Text fw="bold">Study Name</Text>
                            <Text fw="bold">Principal investigator</Text>
                            <Text fw="bold">Researcher</Text>
                            <Text fw="bold">Study Description</Text>
                            <Text fw="bold">IRB</Text>
                            <Text fw="bold">Agreement(s)</Text>
                            <Text fw="bold">Study Code</Text>
                        </Stack>
                    </GridCol>
                    <GridCol span={9}>
                        <Stack>
                            <Text>{study.title}</Text>
                            <Text>{study.piName}</Text>
                            <Text>{study.researcherName}</Text>
                            <Text>{study.description}</Text>
                            <Text>{study.irbProtocols} some link</Text>
                            <Text>TODO agreements</Text>
                            <Text>TODO study code</Text>
                        </Stack>
                    </GridCol>
                </Grid>
            </Stack>
        </Stack>
    )
}
