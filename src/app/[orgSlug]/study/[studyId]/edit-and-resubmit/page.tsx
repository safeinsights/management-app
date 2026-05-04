import { Stack } from '@mantine/core'
import { notFound } from 'next/navigation'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction } from '@/server/actions/study.actions'
import { getUsersForOrgId } from '@/server/db/queries'
import { db } from '@/database'
import { displayOrgName } from '@/lib/string'
import { EditResubmitProvider } from '@/contexts/edit-resubmit'
import { EditResubmitForm } from './form'
import { FeatureFlagGate } from './feature-flag-gate'
import type { ProposalFeedbackEntry } from './types'

export default async function StudyEditAndResubmitRoute(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
}) {
    const { studyId, orgSlug } = await props.params

    const study = await getStudyAction({ studyId })

    if ('error' in study) return notFound()
    if (study.status !== 'CHANGE-REQUESTED') return notFound()

    // Inlined here rather than importing OTTER-501's getProposalFeedbackForStudyAction
    // so OTTER-521 ships independently. When 501 lands, swap to that action.
    const entries: ProposalFeedbackEntry[] = await db
        .selectFrom('studyProposalComment')
        .innerJoin('user as author', 'author.id', 'studyProposalComment.authorId')
        .select([
            'studyProposalComment.id',
            'studyProposalComment.authorId',
            'studyProposalComment.authorRole',
            'studyProposalComment.entryType',
            'studyProposalComment.decision',
            'studyProposalComment.body',
            'studyProposalComment.createdAt',
            'author.fullName as authorName',
        ])
        .where('studyProposalComment.studyId', '=', studyId)
        .orderBy('studyProposalComment.createdAt', 'desc')
        .execute()

    const enclaveOrg = await db.selectFrom('org').select('name').where('id', '=', study.orgId).executeTakeFirst()

    const labMembers = await getUsersForOrgId(study.submittedByOrgId)
    const memberOptions = labMembers.map((m) => ({ value: m.id, label: m.fullName }))

    return (
        <FeatureFlagGate orgSlug={orgSlug} studyId={studyId}>
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
