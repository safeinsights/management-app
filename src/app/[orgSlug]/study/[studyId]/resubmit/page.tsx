import { Box, Stack, Title } from '@mantine/core'
import { notFound } from 'next/navigation'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { Routes } from '@/lib/routes'
import { db } from '@/database'
import { displayOrgName } from '@/lib/string'
import { canResubmitStudyCode } from '@/lib/code-resubmission'
import { fetchLatestCodeEnvForStudyIdOrNull, latestSubmittedJobForStudy } from '@/server/db/queries'
import { getCodeReviewFeedbackAction, getStudyAction } from '@/server/actions/study.actions'
import { EditCodeResubmitProvider } from '@/contexts/edit-code-resubmit'
import { EditStudyCodeView } from './edit-study-code-view'

export default async function ResubmitStudyCodePage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params
    const study = await getStudyAction({ studyId })

    if ('error' in study || !study.submittedByOrgSlug || study.title === null) {
        return notFound()
    }

    // Gate on the latest *submitted* job: opening this page begins a new round, and a file upload
    // here creates a fresh INITIATED round job that would otherwise mask the prior submission and
    // make canResubmitStudyCode fail (OTTER-601). The prior submission's status is what gates resubmit.
    //
    // OTTER-556 follow-up: test the whole status history, not statusChanges[0]. jobStatusChange
    // .createdAt defaults to now() (constant within a transaction) and v7 ids are not reliably
    // monotonic within a millisecond, so a late CODE-SCANNED webhook can append after the decision
    // and become the topmost row. The "Edit and resubmit" button uses the order-independent decision
    // helper, so reading only the top row here would 404 a page the button correctly linked to.
    const latestJob = await latestSubmittedJobForStudy(studyId)
    const canResubmit = latestJob?.statusChanges.some((s) => canResubmitStudyCode(s.status)) ?? false

    if (!canResubmit) return notFound()

    const feedbackResult = await getCodeReviewFeedbackAction({ studyId })
    if ('error' in feedbackResult) return notFound()
    const feedbackEntries = feedbackResult

    const enclaveOrg = await db.selectFrom('org').select('name').where('id', '=', study.orgId).executeTakeFirst()
    const orgName = displayOrgName(enclaveOrg?.name ?? '')

    const studyHasCodeEnv = (await fetchLatestCodeEnvForStudyIdOrNull(studyId)) != null

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xl" py="xl">
                <PageBreadcrumbs
                    crumbs={[
                        ['Dashboard', Routes.dashboard],
                        ['Study proposal', Routes.studySubmitted({ orgSlug, studyId })],
                        ['Study code', Routes.studyView({ orgSlug, studyId })],
                        ['Edit study code'],
                    ]}
                />
                <Title order={1}>Study proposal</Title>
                <EditCodeResubmitProvider studyId={studyId} initialNote={study.codeResubmissionNoteDraft ?? ''}>
                    <EditStudyCodeView
                        studyId={studyId}
                        studyTitle={study.title}
                        orgName={orgName}
                        feedbackEntries={feedbackEntries}
                        studyHasCodeEnv={studyHasCodeEnv}
                    />
                </EditCodeResubmitProvider>
            </Stack>
        </Box>
    )
}
