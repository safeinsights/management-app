import { db } from '@/database'
import { Form } from './form'
import { Paper, Container } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { b64toUUID } from '@/lib/uuid'

export const dynamic = 'force-dynamic'

export default async function StudyEditPage(props: { params: Promise<{ encodedStudyId: string }> }) {
    const params = await props.params

    const { encodedStudyId } = params

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
        <Form
            studyId={study.id}
            study={{
                ...study,
                highlights: study.dataSources?.includes('highlights'),
                eventCapture: study.dataSources?.includes('eventCapture'),
            }}
        />
    )
}
