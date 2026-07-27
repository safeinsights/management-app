import { Box, Stack } from '@mantine/core'
import { notFound } from 'next/navigation'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { db } from '@/database'
import { displayOrgName } from '@/lib/string'
import { canResearcherResubmitCode, projectStudyState } from '@/lib/study-screen'
import { fetchLatestCodeEnvForStudyIdOrNull } from '@/server/db/queries'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { getCodeReviewFeedbackAction, getStudyAction } from '@/server/actions/study.actions'
import { EditCodeResubmitProvider } from '@/contexts/edit-code-resubmit'
import { EditStudyCodeView } from './edit-study-code-view'

export default async function ResubmitStudyCodePage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params
    const study = await getStudyAction({ studyId })

    if ('error' in study || !study.submittedByOrgSlug || study.title === null) {
        return notFound()
    }

    // Resubmit eligibility is a projected-state fact (order-independent: statuses as a Set, latest job by
    // max(id); and liveness-aware) and is the SAME predicate the autosave + resubmit server actions gate
    // on, so the page never renders a state those actions would reject. See canResearcherResubmitCode.
    const raw = await rawStudyStateForStudy(studyId)
    if (!raw || !canResearcherResubmitCode(projectStudyState(raw))) return notFound()

    const feedbackResult = await getCodeReviewFeedbackAction({ studyId })
    if ('error' in feedbackResult) return notFound()
    const feedbackEntries = feedbackResult

    const enclaveOrg = await db.selectFrom('org').select('name').where('id', '=', study.orgId).executeTakeFirst()
    const orgName = displayOrgName(enclaveOrg?.name ?? '')

    const studyHasCodeEnv = (await fetchLatestCodeEnvForStudyIdOrNull(studyId)) != null

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <PageBreadcrumbs
                    crumbs={[
                        ['Dashboard', Routes.dashboard],
                        ['Study proposal', Routes.studySubmitted({ orgSlug, studyId })],
                        ['Study code', Routes.studyView({ orgSlug, studyId })],
                        ['Edit study code'],
                    ]}
                />
                <StudyPageHeader>Study proposal</StudyPageHeader>
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
