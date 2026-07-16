import { redirect } from 'next/navigation'
import { db } from '@/database'
import { AlertNotFound } from '@/components/errors'
import { Routes } from '@/lib/routes'
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
            'study.submittedAt',
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

    // OTTER-636: a reverted draft (previously submitted, flipped back to DRAFT by an edit on the Edit
    // Proposal page) belongs on the resubmit-with-note flow, not this fresh-draft Step 1/2 wizard.
    if (study.submittedAt != null) {
        redirect(Routes.studyEditAndResubmit({ orgSlug, studyId }))
    }

    // /edit is a revisitable step: an authorized DRAFT researcher can open it directly, forward or
    // back, regardless of how far the draft has progressed. The screen authority (resolveScreen)
    // decides the canonical screen, so this page no longer self-redirects to resume on Step 2.
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
