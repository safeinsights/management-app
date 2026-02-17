import { db } from '@/database'
import { AlertNotFound } from '@/components/errors'
import { StudyProposal } from '../../request/proposal'

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

    if (!study || study.status !== 'DRAFT') {
        return (
            <AlertNotFound title="Study was not found" message="Only studies that are in DRAFT status can be edited." />
        )
    }

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
