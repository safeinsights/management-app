import { Stack } from '@mantine/core'
import { getDraftStudyAction } from '@/server/actions/study-request'
import { getUsersForOrgId } from '@/server/db/queries'
import { notFound, redirect } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { ProposalForm } from './form'
import { ProposalProvider } from '@/contexts/proposal'
import { StudyRequestPageHeader } from '../../request/page-header'
import { displayOrgName } from '@/lib/string'

export default async function StudyProposalRoute(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    const result = await getDraftStudyAction({ studyId })

    if ('error' in result) {
        return notFound()
    }

    if (result.status !== 'DRAFT' && result.status !== 'CHANGE-REQUESTED') {
        redirect(Routes.studyReview({ orgSlug, studyId }))
    }

    // OTTER-690: /proposal is the DRAFT Step 2 editor and nothing routes a CHANGE-REQUESTED study
    // here (the dashboard sends it to /edit-and-resubmit, which is the page built for that state:
    // it carries the reviewer feedback and the resubmission note this one has no UI for). Making
    // that explicit lets ProposalProvider below be unconditionally DRAFT, so the title ownership
    // split does not have to be re-derived by every consumer. A stale bookmark now lands on the
    // working page instead of a half-working one.
    if (result.status === 'CHANGE-REQUESTED') {
        redirect(Routes.studyEditAndResubmit({ orgSlug, studyId }))
    }

    // A DRAFT predating OTTER-690 can have no title: the migration that made the column nullable
    // cleared every 'Untitled Draft' placeholder, and this page no longer carries a title field to
    // put one back. Submitting from here would violate the study_title_required_when_not_draft
    // check constraint, and the dashboard routes any draft with Step 2 progress straight here, so
    // Step 1 (which owns the title and is revisitable) is the only way out.
    if (!result.title?.trim()) {
        redirect(Routes.studyEdit({ orgSlug, studyId }))
    }

    const labMembers = await getUsersForOrgId(result.submittedByOrgId)
    const memberOptions = labMembers.map((m) => ({ value: m.id, label: m.fullName }))

    return (
        <Stack p="xl" gap="xl">
            <StudyRequestPageHeader />
            <ProposalProvider
                studyId={studyId}
                draftData={{
                    title: result.title ?? '',
                    piName: result.piName,
                    piUserId: result.piUserId ?? '',
                    datasets: result.datasets ?? undefined,
                    researchQuestions: result.researchQuestions ? JSON.stringify(result.researchQuestions) : undefined,
                    projectSummary: result.projectSummary ? JSON.stringify(result.projectSummary) : undefined,
                    impact: result.impact ? JSON.stringify(result.impact) : undefined,
                    additionalNotes: result.additionalNotes ? JSON.stringify(result.additionalNotes) : undefined,
                }}
            >
                <ProposalForm
                    orgName={displayOrgName(result.orgName)}
                    members={memberOptions}
                    researcherName={result.researcherName}
                    researcherId={result.researcherId}
                    enclaveOrgSlug={result.orgSlug}
                    studyTitle={result.title}
                />
            </ProposalProvider>
        </Stack>
    )
}
