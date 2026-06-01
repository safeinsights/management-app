import { Stack } from '@mantine/core'
import { notFound } from 'next/navigation'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction, getProposalFeedbackForStudyAction } from '@/server/actions/study.actions'
import { getUsersForOrgId } from '@/server/db/queries'
import { sessionFromClerk } from '@/server/clerk'
import { db } from '@/database'
import { displayOrgName } from '@/lib/string'
import { EditResubmitProvider } from '@/contexts/edit-resubmit'
import { EditResubmitForm } from './form'

export default async function StudyEditAndResubmitRoute(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
}) {
    const { studyId, orgSlug } = await props.params

    const study = await getStudyAction({ studyId })

    if ('error' in study) return notFound()
    if (study.status !== 'CHANGE-REQUESTED') return notFound()

    // Mirrors the lab-scoping the server actions enforce: any researcher in
    // the submitting lab can edit & resubmit. Non-lab visitors see a 404
    // rather than a form that would silently no-op on save.
    const session = await sessionFromClerk()
    const userLabOrgIds = session
        ? Object.values(session.orgs)
              .filter((org) => org.type === 'lab')
              .map((org) => org.id)
        : []
    if (!session || !userLabOrgIds.includes(study.submittedByOrgId)) return notFound()

    const entriesResult = await getProposalFeedbackForStudyAction({ studyId })
    if ('error' in entriesResult) return notFound()
    const entries = entriesResult

    const enclaveOrg = await db.selectFrom('org').select('name').where('id', '=', study.orgId).executeTakeFirst()

    const labMembers = await getUsersForOrgId(study.submittedByOrgId)
    const memberOptions = labMembers.map((m) => ({ value: m.id, label: m.fullName }))

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{ orgSlug, studyId, studyTitle: study.title, current: 'Edit Initial Request' }}
            />
            <EditResubmitProvider
                studyId={studyId}
                initialNote={study.proposalResubmissionNoteDraft ?? ''}
                draftData={{
                    title: study.title ?? '',
                    piName: study.piName,
                    piUserId: study.piUserId ?? undefined,
                    datasets: study.datasets ?? undefined,
                    researchQuestions: study.researchQuestions ? JSON.stringify(study.researchQuestions) : undefined,
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
    )
}
