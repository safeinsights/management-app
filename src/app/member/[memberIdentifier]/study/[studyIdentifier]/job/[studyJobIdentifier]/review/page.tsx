import { Button, Flex, Paper, Title } from '@mantine/core'
import Link from 'next/link'
import { dataForJobAction } from './actions'
import { AlertNotFound, ErrorAlert } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { ReviewControls } from './controls'
import { Files } from './files'
import { MemberBreadcrumbs } from '@/components/page-breadcrumbs'

export default async function StudyReviewPage(props: {
    params: Promise<{
        memberIdentifier: string
        studyIdentifier: string
        studyJobIdentifier: string
    }>
}) {
    const params = await props.params

    const { memberIdentifier, studyJobIdentifier, studyIdentifier } = params

    // TODO check user permissions
    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const { jobInfo, manifest } = await dataForJobAction(studyJobIdentifier)
    if (!jobInfo || !manifest) {
        return <AlertNotFound title="StudyJob was not found" message="no such study job exists" />
    }

    const initialExpanded = manifest.tree.children?.length == 1 ? manifest.tree.children[0].value : undefined

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <MemberBreadcrumbs
                crumbs={{
                    memberIdentifier,
                    studyIdentifier,
                    studyTitle: jobInfo.studyTitle,
                    current: 'Review code',
                }}
            />
            {manifest.size == 0 && (
                <ErrorAlert
                    title="No files found"
                    error="We failed to extract any files for this code job.  This is almost certainly an error, approve with caution"
                />
            )}
            <Flex justify="space-between" align="center">
                <Title mb="lg" order={5}>
                    Review code for code run submitted on {jobInfo.createdAt.toLocaleString()} -{' '}
                    {Object.keys(manifest.files).length} files, {Math.round((manifest.size / 1048576) * 100) / 100}MB
                </Title>
                <Flex gap="md" direction="column">
                    <Link href={`/member/${memberIdentifier}/studies/review`}>
                        <Button color="blue">Back to pending review</Button>
                    </Link>
                    <ReviewControls memberIdentifier={memberIdentifier} job={jobInfo} />
                </Flex>
            </Flex>
            <Files
                data={manifest?.tree.children || []}
                jobInfo={jobInfo}
                manifest={manifest}
                initialExpanded={initialExpanded}
            />
        </Paper>
    )
}
