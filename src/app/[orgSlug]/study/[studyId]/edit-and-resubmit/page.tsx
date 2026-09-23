import type { Metadata } from 'next'
import { Stack } from '@mantine/core'
import { notFound } from 'next/navigation'
import { getStudyAction, getProposalFeedbackForStudyAction } from '@/server/actions/study.actions'
import { getUsersForOrgId, upcomingResubmissionNoteVersion } from '@/server/db/queries'
import { sessionFromClerk } from '@/server/clerk'
import { db } from '@/database'
import { displayOrgName } from '@/lib/string'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { EditResubmitProvider } from '@/contexts/edit-resubmit'
import { EditResubmitForm } from './form'

export const metadata: Metadata = { title: 'Edit proposal' }

export default async function StudyEditAndResubmitRoute(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
}) {
    const { studyId } = await props.params

    const study = await getStudyAction({ studyId })

    if ('error' in study) return notFound()
    if (study.status !== 'CHANGE-REQUESTED') return notFound()

    // OTTER-497: gate on lab membership, not authorship. getStudyAction only requires `view
    // Study`, which reviewer-org users also hold.
    const session = await sessionFromClerk()
    if (!session) return notFound()
    const isLabMember = Object.values(session.orgs).some((o) => o.id === study.submittedByOrgId)
    if (!isLabMember) return notFound()

    // Resolved server-side: the browser only knows the viewer's Clerk id, not the database user
    // id researcherId records.
    const isDraftCreator = session.user.id === study.researcherId

    const entriesResult = await getProposalFeedbackForStudyAction({ studyId })
    if ('error' in entriesResult) return notFound()
    const entries = entriesResult

    const enclaveOrg = await db.selectFrom('org').select('name').where('id', '=', study.orgId).executeTakeFirst()

    const labMembers = await getUsersForOrgId(study.submittedByOrgId)
    const memberOptions = labMembers.map((m) => ({ value: m.id, label: m.fullName }))

    const noteVersion = await upcomingResubmissionNoteVersion(studyId)
    const initialNote = study.proposalResubmissionNoteDraft ?? ''

    return (
        <Stack p="xl" gap="xl">
            <EditResubmitProvider
                studyId={studyId}
                initialNote={initialNote}
                draftData={{
                    title: study.title ?? '',
                    piName: study.piName,
                    piUserId: study.piUserId ?? '',
                    datasets: study.datasets ?? undefined,
                    researchQuestions: study.researchQuestions ? JSON.stringify(study.researchQuestions) : undefined,
                    projectSummary: study.projectSummary ? JSON.stringify(study.projectSummary) : undefined,
                    impact: study.impact ? JSON.stringify(study.impact) : undefined,
                    additionalNotes: study.additionalNotes ? JSON.stringify(study.additionalNotes) : undefined,
                }}
            >
                <EditResubmitForm
                    header={<StudyPageHeader study={study} />}
                    orgName={displayOrgName(enclaveOrg?.name ?? '')}
                    members={memberOptions}
                    researcherName={study.createdBy}
                    researcherId={study.researcherId}
                    enclaveOrgSlug={study.orgSlug}
                    feedbackEntries={entries}
                    noteVersion={noteVersion}
                    initialNote={initialNote}
                    studyTitle={study.title}
                    isDraftCreator={isDraftCreator}
                />
            </EditResubmitProvider>
        </Stack>
    )
}
