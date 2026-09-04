import { Stack } from '@mantine/core'
import { getDraftStudyAction } from '@/server/actions/study-request'
import { getUsersForOrgId } from '@/server/db/queries'
import { sessionFromClerk } from '@/server/clerk'
import { notFound, redirect } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { ProposalForm } from './form'
import { ProposalProvider } from '@/contexts/proposal'
import { StudyPageHeader } from '@/components/study/study-page-header'
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

    // A CHANGE-REQUESTED study belongs on /edit-and-resubmit; redirecting here lets
    // ProposalProvider below be unconditionally DRAFT (OTTER-690).
    if (result.status === 'CHANGE-REQUESTED') {
        redirect(Routes.studyEditAndResubmit({ orgSlug, studyId }))
    }

    // Step 2 has no title field, so a blank or over-cap title can only be fixed on Step 1
    // (OTTER-690, OTTER-737).
    if (!result.title?.trim() || countCharacters(result.title) > STUDY_TITLE_MAX_CHARACTERS) {
        redirect(Routes.studyEdit({ orgSlug, studyId }))
    }

    // Resolved server-side: the browser only knows the viewer's Clerk id, not the database user
    // id researcherId records.
    const session = await sessionFromClerk()
    const isDraftCreator = !!session && session.user.id === result.researcherId

    const labMembers = await getUsersForOrgId(result.submittedByOrgId)
    const memberOptions = labMembers.map((m) => ({ value: m.id, label: m.fullName }))

    return (
        <Stack p="xl" gap="xl">
            <StudyPageHeader study={result} />
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
