import { redirect } from 'next/navigation'
import { db } from '@/database'
import { AlertNotFound } from '@/components/errors'
import { Routes } from '@/lib/routes'
import { draftHasStep2Progress } from '@/lib/studies'
import { StudyProposal } from '../../request/proposal'

export default async function StudyEditPage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const params = await props.params
    const { studyId, orgSlug } = params

    // TODO: validate that member from clerk session matches memberId from url
    const study = await db
        .selectFrom('study')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select([
            'study.id',
            'study.status',
            'study.title',
            'study.piName',
            'study.piUserId',
            'study.language',
            'study.descriptionDocPath',
            'study.irbDocPath',
            'study.agreementDocPath',
            'study.dataSources',
            'study.datasets',
            'study.researchQuestions',
            'study.projectSummary',
            'study.impact',
            'study.additionalNotes',
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

    // OTTER-572: drafts that already reached Step 2 reopen on Step 2 instead of
    // always sending the researcher back to the Step 1 data-org picker.
    if (draftHasStep2Progress(study)) {
        redirect(Routes.studyProposal({ orgSlug, studyId }))
    }

    return (
        <StudyProposal
            studyId={studyId}
            draftData={{
                id: studyId,
                title: study.title ?? '',
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
