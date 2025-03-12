import { Center, Group, Paper, Stack, Title } from '@mantine/core'
import { db } from '@/database'
import { StudyPanel } from './panel'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'

export default async function StudyReviewPage(props: { params: Promise<{ studyId: string }> }) {
    const params = await props.params

    const { studyId } = params

    // TODO check user permissions
    const study = await db.selectFrom('study').selectAll().where('id', '=', studyId).executeTakeFirst()

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <Center>
            <Paper w="70%" shadow="xs" p="sm" m="xs">
                <ResearcherBreadcrumbs crumbs={{ studyId, current: study.title }} />
                <Stack>
                    <Group gap="xl" mb="xl">
                        <Title>{study.title}</Title>
                    </Group>
                </Stack>
                <StudyPanel study={study} />
            </Paper>
        </Center>
    )
}
