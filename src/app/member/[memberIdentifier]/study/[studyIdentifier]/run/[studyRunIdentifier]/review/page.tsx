import { Button, Flex, Paper, Title } from '@mantine/core'

import Link from 'next/link'
import { dataForRunAction } from './actions'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/members'
import { ReviewControls } from './controls'
import { Files } from './files'
import { MemberBreadcrumbs } from '@/components/page-breadcrumbs'
import { MinimalRunInfo } from '@/lib/types'

export default async function StudyReviewPage({
    params: { memberIdentifier, studyRunIdentifier, studyIdentifier },
}: {
    params: {
        memberIdentifier: string
        studyIdentifier: string
        studyRunIdentifier: string
    }
}) {
    // TODO check user permissions
    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const { run, manifest } = await dataForRunAction(studyRunIdentifier)
    if (!run || !manifest) {
        return <AlertNotFound title="StudyRun was not found" message="no such study run exists" />
    }
    const runInfo: MinimalRunInfo = { studyRunId: run.id, memberIdentifier, studyId: run.studyId }

    const initialExpanded = manifest.tree.children?.length == 1 ? manifest.tree.children[0].value : undefined

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <MemberBreadcrumbs
                crumbs={{
                    memberIdentifier,
                    studyIdentifier,
                    studyTitle: run.studyTitle,
                    current: 'Review code',
                }}
            />
            <Flex justify="space-between" align="center">
                <Title mb="lg" order={5}>
                    Review code for code run submitted on {run.createdAt.toLocaleString()} -{' '}
                    {Object.keys(manifest.files).length} files, {manifest.size / 1048576}MB
                </Title>

                <Flex gap="md" direction="column">
                    <Link href={`/member/${memberIdentifier}/studies/review`}>
                        <Button color="blue">Back to pending review</Button>
                    </Link>
                    <ReviewControls memberIdentifier={memberIdentifier} run={runInfo} />
                </Flex>
            </Flex>
            <Files
                data={manifest?.tree.children || []}
                run={runInfo}
                manifest={manifest}
                initialExpanded={initialExpanded}
            />
        </Paper>
    )
}
