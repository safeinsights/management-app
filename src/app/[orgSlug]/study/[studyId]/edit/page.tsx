import { db } from '@/database'
import { Form } from './form'
import { Paper, Container } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { StudyProposal } from '../../request/proposal'

export const dynamic = 'force-dynamic'

export default async function StudyEditPage(props: { params: Promise<{ studyId: string }> }) {
    const params = await props.params
    const { studyId } = params

    // TODO: validate that member from clerk session matches memberId from url
    const study = await db
        .selectFrom('study')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select([
            'study.id',
            'study.status',
            'study.title',
            'study.piName',
            'study.language',
            'study.descriptionDocPath',
            'study.irbDocPath',
            'study.agreementDocPath',
            'study.dataSources',
            'study.containerLocation',
            'study.outputMimeType',
            'org.slug as orgSlug',
        ])
        .where('study.id', '=', studyId)
        .executeTakeFirst()

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    // Draft studies use the full proposal form
    if (study.status === 'DRAFT') {
        return (
            <StudyProposal
                studyId={studyId}
                draftData={{
                    id: studyId,
                    title: study.title,
                    piName: study.piName,
                    language: study.language,
                    orgSlug: study.orgSlug,
                    descriptionDocPath: study.descriptionDocPath,
                    irbDocPath: study.irbDocPath,
                    agreementDocPath: study.agreementDocPath,
                }}
            />
        )
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
