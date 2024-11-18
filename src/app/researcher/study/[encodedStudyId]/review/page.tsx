import { Paper, Center, Title, Stack, Group } from '@mantine/core'
import { db } from '@/database'
import { uuidToB64 } from '@/lib/uuid'
import { StudyPanel } from './panel'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'

export default async function StudyReviewPage({
    params: { studyIdentifier, encodedStudyId },
}: {
    params: { studyIdentifier: string; encodedStudyId: string }
}) {
    // TODO check user permissions

    const study = await db
        .selectFrom('study')
        .selectAll()
        .where('id', '=', uuidToB64(encodedStudyId))
        .executeTakeFirst()

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <Center>
            <Paper w="50%" shadow="xs" p="sm" m="xs">
                <ResearcherBreadcrumbs crumbs={{ encodedStudyId, current: study.title }} />
                <Stack>
                    <Group gap="xl" mb="xl">
                        <Title>{study.title}</Title>
                        {/* <Flex justify="space-between" align="center" mb="lg">
                            <Flex gap="md" direction="column">
                                <Link href={`/member/${memberIdentifier}/studies/review`}>
                                    <Button color="blue">Back to pending review</Button>
                                </Link>
                            </Flex>
                        </Flex> */}
                    </Group>
                </Stack>
                <StudyPanel study={study} studyIdentifier={studyIdentifier} />
            </Paper>
        </Center>
    )
}
