import type { Metadata } from 'next'
import { AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { StudyNavSearchParams } from '@/lib/routes'
import { setupStepNav } from '@/lib/study-screen'
import { getStudyAction } from '@/server/actions/study.actions'
import { StudyProposal } from '../../request/proposal'
import { researcherPageGuard } from '../researcher-page-guard'

export const metadata: Metadata = { title: 'Set up study' }

export default async function StudyEditPage(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
    searchParams: Promise<{ from?: string }>
}) {
    const { studyId, orgSlug } = await props.params
    const { from } = StudyNavSearchParams.parse(await props.searchParams)

    // getStudyAction rather than a query of our own: it carries the `view Study` ability check and
    // filters soft-deleted rows.
    const study = await getStudyAction({ studyId })

    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    const guard = await researcherPageGuard(study, studyId)
    if (!guard.ok) return guard.render

    // A DRAFT is the editable wizard, a submitted study the same page as a read-only record
    // (OTTER-764). Revisitable either way, so it never self-redirects to resume on Step 2.
    return (
        <StudyProposal
            studyId={studyId}
            nextStepHref={setupStepNav(study.status, { orgSlug, studyId, from }).forward?.href}
            draftData={{
                id: studyId,
                title: study.title ?? '',
                piName: study.piName,
                language: study.language,
                status: study.status,
                orgSlug: study.orgSlug,
                orgName: study.orgName,
                submittingLabName: study.submittingLabName,
                descriptionDocPath: study.descriptionDocPath,
                irbDocPath: study.irbDocPath,
                agreementDocPath: study.agreementDocPath,
            }}
        />
    )
}
