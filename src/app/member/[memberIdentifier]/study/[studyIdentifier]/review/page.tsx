import { Paper, Center, Title, Text, Stack, Group } from '@mantine/core'
import { b64toUUID } from '@/lib/uuid'
import { StudyPanel } from './panel'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { MemberBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction } from '@/server/actions/study-actions'

export default async function StudyReviewPage(props: {
    params: Promise<{
        memberIdentifier: string
        studyIdentifier: string
    }>
}) {
    const params = await props.params

    const { memberIdentifier, studyIdentifier } = params

    // TODO check user permissions
    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const study = await getStudyAction(b64toUUID(studyIdentifier))

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <Center>
            <Paper w="50%" shadow="xs" p="sm" m="xs">
                <MemberBreadcrumbs crumbs={{ memberIdentifier, current: study.title }} />
                <Stack>
                    <Group gap="xl">
                        <Title>
                            {study.title} | {study.piName}
                        </Title>
                    </Group>

                    <Text c="#7F7D7D" mb={30} pt={10} fz="lg" fs="italic">
                        {'{'}Communication between member and researcher will be skipped for this pilot{'}'}
                    </Text>
                </Stack>
                <StudyPanel study={study} memberIdentifier={memberIdentifier} />
            </Paper>
        </Center>
    )
}
