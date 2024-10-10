import { db } from '@/database'
import { Form } from './form'
import { Paper } from '@mantine/core'
import { AlertNotFound } from '@/components/alerts'
import { b64toUUID } from '@/server/uuid'

export default async function StudyEditPage({
    params: { memberIdentifier: _, encodedStudyId },
}: {
    params: { memberIdentifier: string; encodedStudyId: string }
}) {
    // TODO: validate that member from clerk session matches memberId from url

    const study = await db
        .selectFrom('study')
        .selectAll()
        .where('id', '=', b64toUUID(encodedStudyId))
        .executeTakeFirst()

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <Paper bg="#f5f5f5" shadow="none" p={30} mt={30} radius="sm">
            <Form
                studyId={study.id}
                study={{
                    ...study,
                    highlights: study.dataSources?.includes('highlights'),
                    eventCapture: study.dataSources?.includes('eventCapture'),
                }}
            />
        </Paper>
    )
}
