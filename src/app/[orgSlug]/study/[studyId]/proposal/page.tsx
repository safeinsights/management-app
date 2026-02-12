'use server'

import { Stack } from '@mantine/core'
import { getDraftStudyAction } from '@/server/actions/study-request'
import { getUsersForOrgId } from '@/server/db/queries'
import { notFound, redirect } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { Step2Form } from './step2-form'
import { Step2Provider } from './step2-context'
import { StudyRequestPageHeader } from '../../request/page-header'
import { displayOrgName } from '@/lib/string'

export default async function StudyProposalRoute(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    const result = await getDraftStudyAction({ studyId })

    if ('error' in result) {
        return notFound()
    }

    if (result.status !== 'DRAFT') {
        redirect(Routes.studyReview({ orgSlug, studyId }))
    }

    // TODO: Fetch datasets for the org

    const labMembers = await getUsersForOrgId(result.submittedByOrgId)
    const memberOptions = labMembers.map((m) => ({ value: m.fullName, label: m.fullName }))

    return (
        <Stack p="xl" gap="xl">
            <StudyRequestPageHeader orgSlug={orgSlug} />
            <Step2Provider
                studyId={studyId}
                draftData={{
                    title: result.title,
                    piName: result.piName,
                    datasets: result.datasets ?? undefined,
                    researchQuestions: result.researchQuestions ?? undefined,
                    projectSummary: result.projectSummary ?? undefined,
                    impact: result.impact ?? undefined,
                    additionalNotes: result.additionalNotes ?? undefined,
                }}
            >
                <Step2Form
                    orgName={displayOrgName(result.orgName)}
                    datasets={[]}
                    members={memberOptions}
                    researcherName={result.researcherName}
                />
            </Step2Provider>
        </Stack>
    )
}
