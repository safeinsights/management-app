import { Stack } from '@mantine/core'
import { notFound } from 'next/navigation'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction, getProposalFeedbackForStudyAction } from '@/server/actions/study.actions'
import { isStudyOwnedByCurrentUserAction } from '@/server/actions/study-request'
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

    // Server-side writes are scoped to the original researcher — gate the
    // page itself to match, so non-authors don't see a form that would
    // silently no-op when they try to save.
    const ownership = await isStudyOwnedByCurrentUserAction({ studyId })
    if ('error' in ownership || !ownership.isOwner) return notFound()

    const entriesResult = await getProposalFeedbackForStudyAction({ studyId })
    // Don't render the page with a silent empty feedback list — the researcher
    // is being asked to address feedback and we'd be hiding the fact that we
    // couldn't load it.
    if ('error' in entriesResult) return notFound()
    const entries = entriesResult

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
