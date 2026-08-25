import { Stack } from '@mantine/core'
import { getDraftStudyAction } from '@/server/actions/study-request'
import { getUsersForOrgId } from '@/server/db/queries'
import { sessionFromClerk } from '@/server/clerk'
import { notFound, redirect } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { ProposalForm } from './form'
import { ProposalProvider } from '@/contexts/proposal'
import { StudyRequestPageHeader } from '../../request/page-header'
import { displayOrgName } from '@/lib/string'
import { countCharacters } from '@/lib/field-limits'
import { STUDY_TITLE_MAX_CHARACTERS } from '@/app/[orgSlug]/study/request/form-schemas'

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

    // A DRAFT predating OTTER-690 can carry a title this page cannot fix: it may have none (the
    // migration that made the column nullable cleared every 'Untitled Draft' placeholder) or one
    // longer than the OTTER-737 cap, and Step 2 has no title field to put either right. Submitting
    // would then fail on the far side - the check constraint study_title_required_when_not_draft for
    // a blank title, finalizeStudySubmissionAction's cap for a long one - and report it against a
    // field that is not on the screen, which is a dead end rather than a message. The dashboard
    // routes any draft with Step 2 progress straight here, so Step 1, which owns the title and is
    // revisitable, is the only way out. Its counter and its error then show the researcher the
    // problem on the field itself.
    if (!result.title?.trim() || countCharacters(result.title) > STUDY_TITLE_MAX_CHARACTERS) {
        redirect(Routes.studyEdit({ orgSlug, studyId }))
    }

    // Resolved here rather than on the client: the Researcher row keys off the study's creator,
    // and the browser only knows the viewer's Clerk id, not the database user id `researcherId`
    // records. Same approach the edit-and-resubmit page already takes.
    const session = await sessionFromClerk()
    const isDraftCreator = !!session && session.user.id === result.researcherId

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
                    isDraftCreator={isDraftCreator}
                />
            </ProposalProvider>
        </Stack>
    )
}
