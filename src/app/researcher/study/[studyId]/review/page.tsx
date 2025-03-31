import { Divider, Paper, Stack, Title, Text } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyProposalDetails } from '@/components/study/study-proposal-details'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { StudyResults } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/study-results'
import { jobStatusForJobAction, latestJobForStudyAction } from '@/server/actions/study-job.actions'
import { db } from '@/database'
import { getIdentifierFromMemberIdAction } from '@/server/actions/user.actions'
import { getMemberUserFingerprintAction } from '@/server/actions/user-keys.actions'

export default async function StudyReviewPage(props: { params: { studyId: string } }) {
    const { studyId } = props.params

    const fingerprint = await getMemberUserFingerprintAction()

    const study = await db.selectFrom('study').selectAll().where('id', '=', studyId).executeTakeFirst()


    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const memberIdentifier = await getIdentifierFromMemberIdAction(study.memberId)


    const latestJob = await latestJobForStudyAction(study.id)
    const latestJobStatus = await jobStatusForJobAction(latestJob?.id)

    return (
        <>
            <Stack px="xl" gap="xl">
                <ResearcherBreadcrumbs
                    crumbs={{
                        studyId,
                        studyTitle: study?.title,
                        current: 'Study Details',
                    }}
                />
                <Divider />
                <Paper bg="white" p="xl">
                    <Stack mt="md">
                        <Title order={3}>{study.title}</Title>
                       
                            <StudyProposalDetails
                                params={{
                                    memberIdentifier,
                                    studyIdentifier: studyId,
                                }}
                            />

                    </Stack>
                </Paper>

                <Paper bg="white" p="xl">
                    <Stack mt="md">
                        <Title order={3}>Study Code</Title>
                            <StudyCodeDetails
                                params={{
                                    memberIdentifier: memberIdentifier,
                                    studyIdentifier: studyId,
                                }}
                            />
                    </Stack>
                </Paper>

                <Paper bg="white" p="xl">
                    <Stack mt="md">
                        <Title order={3}>Study Results</Title>
                        <Divider />
                        <Text>Study results will be displayed after the data organization reviews them.</Text>
                            {/* TODO: If results are available, show them */}
                    </Stack>
                </Paper>
            </Stack>
        </>
    )
}
