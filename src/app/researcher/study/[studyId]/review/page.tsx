import { Group, Paper, Stack } from '@mantine/core'
import { db } from '@/database'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { checkUserAllowedStudyView, latestJobForStudy } from '@/server/db/queries'
import { ViewCSV } from './results'

export default async function StudyReviewPage(props: { params: Promise<{ studyId: string }> }) {
    const { studyId } = await props.params

    await checkUserAllowedStudyView(studyId)

    const study = await db.selectFrom('study').selectAll().where('id', '=', studyId).executeTakeFirst()

    const job = await latestJobForStudy(studyId)

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <Paper shadow="xs" p="xl" w="100%">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId,
                    studyTitle: study?.title,
                    current: 'Proposal Request',
                }}
            />
            <Stack>
                <Group gap="xl" mb="xl">
                    <ViewCSV job={job} />
                </Group>
            </Stack>
        </Paper>
    )
}
