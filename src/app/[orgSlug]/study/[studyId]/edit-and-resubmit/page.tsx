import { Stack } from '@mantine/core'
import { notFound } from 'next/navigation'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction, getProposalFeedbackForStudyAction } from '@/server/actions/study.actions'
import { getUsersForOrgId } from '@/server/db/queries'
import { db } from '@/database'
import { displayOrgName } from '@/lib/string'
import { EditResubmitProvider } from '@/contexts/edit-resubmit'
import { EditResubmitForm } from './form'
import { FeatureFlagGate } from './feature-flag-gate'

export default async function StudyEditAndResubmitRoute(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
}) {
    const { studyId, orgSlug } = await props.params

    const study = await getStudyAction({ studyId })

    if ('error' in study) return notFound()
    if (study.status !== 'CHANGE-REQUESTED') return notFound()

    const entriesResult = await getProposalFeedbackForStudyAction({ studyId })
    const entries = 'error' in entriesResult ? [] : entriesResult

    const enclaveOrg = await db.selectFrom('org').select('name').where('id', '=', study.orgId).executeTakeFirst()

    const labMembers = await getUsersForOrgId(study.submittedByOrgId)
    const memberOptions = labMembers.map((m) => ({ value: m.id, label: m.fullName }))

    return (
        <FeatureFlagGate>
            <Stack p="xl" gap="xl">
                <ResearcherBreadcrumbs
                    crumbs={{ orgSlug, studyId, studyTitle: study.title, current: 'Edit Initial Request' }}
                />
                <EditResubmitProvider
                    studyId={studyId}
                    draftData={{
                        title: study.title,
                        piName: study.piName,
                        piUserId: study.piUserId ?? undefined,
                        datasets: study.datasets ?? undefined,
                        researchQuestions: study.researchQuestions
                            ? JSON.stringify(study.researchQuestions)
                            : undefined,
                        projectSummary: study.projectSummary ? JSON.stringify(study.projectSummary) : undefined,
                        impact: study.impact ? JSON.stringify(study.impact) : undefined,
                        additionalNotes: study.additionalNotes ? JSON.stringify(study.additionalNotes) : undefined,
                    }}
                >
                    <EditResubmitForm
                        orgName={displayOrgName(enclaveOrg?.name ?? '')}
                        members={memberOptions}
                        researcherName={study.createdBy}
                        researcherId={study.researcherId}
                        enclaveOrgSlug={study.orgSlug}
                        feedbackEntries={entries}
                    />
                </EditResubmitProvider>
            </Stack>
        </FeatureFlagGate>
    )
}
