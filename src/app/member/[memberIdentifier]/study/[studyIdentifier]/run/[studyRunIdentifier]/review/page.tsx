import { Button, Flex, Paper, Title } from '@mantine/core'
import Link from 'next/link'
import { dataForRunAction } from './actions'
import { AlertNotFound, ErrorAlert } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/members'
import { ReviewControls } from './controls'
import { Files } from './files'
import { MemberBreadcrumbs } from '@/components/page-breadcrumbs'

export default async function StudyReviewPage(props: {
    params: Promise<{
        memberIdentifier: string
        studyIdentifier: string
        studyRunIdentifier: string
    }>
}) {
    const params = await props.params

    const { memberIdentifier, studyRunIdentifier, studyIdentifier } = params

    // TODO check user permissions
    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const { runInfo, manifest } = await dataForRunAction(studyRunIdentifier)
    if (!runInfo || !manifest) {
        return <AlertNotFound title="StudyRun was not found" message="no such study run exists" />
    }

    const initialExpanded = manifest.tree.children?.length == 1 ? manifest.tree.children[0].value : undefined

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <MemberBreadcrumbs
                crumbs={{
                    memberIdentifier,
                    studyIdentifier,
                    studyTitle: runInfo.studyTitle,
                    current: 'Review code',
                }}
            />
            {manifest.size == 0 && (
                <ErrorAlert
                    title="No files found"
                    error="We failed to extract any files for this code run.  This is almost certainly an error, approve with caution"
                />
            )}
            <Flex justify="space-between" align="center">
                <Title mb="lg" order={5}>
                    Review code for code run submitted on {runInfo.createdAt.toLocaleString()} -{' '}
                    {Object.keys(manifest.files).length} files, {Math.round((manifest.size / 1048576) * 100) / 100}MB
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
                runInfo={runInfo}
                manifest={manifest}
                initialExpanded={initialExpanded}
            />
        </Paper>
    )
}
