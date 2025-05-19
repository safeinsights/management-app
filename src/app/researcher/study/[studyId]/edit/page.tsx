import { db } from '@/database'
import { Form } from './form'
import { Paper, Container } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'

export const dynamic = 'force-dynamic'

export default async function StudyEditPage(props: { params: Promise<{ studyId: string }> }) {
    const params = await props.params

    const { studyId } = params

    // TODO: validate that member from clerk session matches memberId from url
    const study = await db.selectFrom('study').selectAll('study').where('id', '=', studyId).executeTakeFirst()

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    return (
        <Container w="80%">
            <Paper shadow="xs" p="xl">
                <Form
                    studyId={study.id}
                    study={{
                        ...study,
                        highlights: study.dataSources?.includes('highlights'),
                        eventCapture: study.dataSources?.includes('eventCapture'),
                    }}
                />
            </Paper>
        </Container>
    )
}
