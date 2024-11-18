import { Paper, Center, Title, Text, Stack, Group } from '@mantine/core'
import { b64toUUID } from '@/lib/uuid'
import { StudyPanel } from './panel'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/members'
import { MemberBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction } from './actions'

export default async function StudyReviewPage({
    params: { memberIdentifier, studyIdentifier },
}: {
    params: {
        memberIdentifier: string
        studyIdentifier: string
    }
}) {
    // TODO check user permissions

    const study = await getStudyAction(b64toUUID(studyIdentifier))

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <Center>
            <Paper w="50%" shadow="xs" p="sm" m="xs">
                <MemberBreadcrumbs crumbs={{ studyIdentifier, current: study.title }} />
                <Stack>
                    <Group gap="xl">
                        <Title>
                            {study.title} | {study.piName}
                        </Title>
                        {/* <Flex justify="space-between" align="center" mb="lg">
                            <Flex gap="md" direction="column">
                                <Link href={`/member/${memberIdentifier}/studies/review`}>
                                    <Button color="blue">Back to pending review</Button>
                                </Link>
                            </Flex>
                        </Flex> */}
                    </Group>

                    <Text c="#7F7D7D" mb={30} pt={10} fz="lg" fs="italic">
                        {'{'}Communication between member and researcher will be skipped for this pilot{'}'}
                    </Text>
                </Stack>
                <StudyPanel study={study} studyIdentifier={studyIdentifier} />
            </Paper>
        </Center>
    )
}

