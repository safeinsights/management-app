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

    const labMembers = await getUsersForOrgId(result.submittedByOrgId)
    const memberOptions = labMembers.map((m) => ({ value: m.id, label: m.fullName }))

    return (
        <Stack p="xl" gap="xl">
            <StudyRequestPageHeader orgSlug={orgSlug} studyId={studyId} studyTitle={result.title} />
            <ProposalProvider
                studyId={studyId}
                draftData={{
                    title: result.title,
                    piName: result.piName,
                    piUserId: result.piUserId ?? undefined,
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
                />
            </ProposalProvider>
        </Stack>
    )
}
