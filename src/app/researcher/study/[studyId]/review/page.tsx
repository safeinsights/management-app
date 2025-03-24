import { Paper, Stack, Title } from '@mantine/core'
import { db } from '@/database'
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
        <>
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId,
                    studyTitle: study?.title,
                    current: 'Study Details',
                }}
            />
            <Stack w="100%">
                <Paper p="md" mt="md">
                    <Title mb="lg">{study.title}</Title>
                </Paper>

                <StudyPanel study={study} />
            </Stack>
        </>
    )
}
