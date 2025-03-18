import { Paper, Stack, Title } from '@mantine/core'
import { db } from '@/database'
import { b64toUUID } from '@/lib/uuid'
import { StudyPanel } from './panel'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'

export default async function StudyReviewPage(props: {
    params: Promise<{ studyIdentifier: string; encodedStudyId: string }>
}) {
    const params = await props.params

    const { encodedStudyId } = params

    // TODO check user permissions

    const study = await db
        .selectFrom('study')
        .selectAll()
        .where('id', '=', b64toUUID(encodedStudyId))
        .executeTakeFirst()

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <>
            <ResearcherBreadcrumbs
                crumbs={{
                    encodedStudyId,
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
