import { Box, Stack } from '@mantine/core'
import { notFound } from 'next/navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { db } from '@/database'
import { displayOrgName } from '@/lib/string'
import { canResearcherResubmitCode, projectStudyState } from '@/lib/study-screen'
import { fetchLatestCodeEnvForStudyIdOrNull } from '@/server/db/queries'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { getCodeReviewFeedbackAction, getStudyAction } from '@/server/actions/study.actions'
import { EditCodeResubmitProvider } from '@/contexts/edit-code-resubmit'
import { EditStudyCodeView } from './edit-study-code-view'

export default async function ResubmitStudyCodePage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId } = await props.params
    const study = await getStudyAction({ studyId })

    if ('error' in study || !study.submittedByOrgSlug || study.title === null) {
        return notFound()
    }

    // The same predicate the autosave and resubmit actions gate on, so the page never renders a
    // state those actions would reject.
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
