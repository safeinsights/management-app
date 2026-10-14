import type { Metadata } from 'next'
import { semanticColor } from '@/theme/tokens'
import { Box, Stack } from '@mantine/core'
import { notFound } from 'next/navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { EDIT_CODE_STEP } from '@/components/study/proposal-step-header'
import { canResearcherResubmitCode, projectStudyState } from '@/lib/study-screen'
import { fetchLatestCodeEnvForStudyIdOrNull } from '@/server/db/queries'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { getCodeReviewFeedbackAction, getStudyAction } from '@/server/actions/study.actions'
import { EditCodeResubmitProvider } from '@/contexts/edit-code-resubmit'
import { EditStudyCodeView } from './edit-study-code-view'

export const metadata: Metadata = { title: 'Edit study code' }

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

    const studyHasCodeEnv = (await fetchLatestCodeEnvForStudyIdOrNull(studyId)) != null

    return (
        <Box bg={semanticColor('surface.page')}>
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader study={study} step={EDIT_CODE_STEP} />
                <EditCodeResubmitProvider
                    studyId={studyId}
                    orgName={study.orgName}
                    initialNote={study.codeResubmissionNoteDraft ?? ''}
                >
                    <EditStudyCodeView
                        studyId={studyId}
                        orgName={study.orgName}
                        feedbackEntries={feedbackEntries}
                        studyHasCodeEnv={studyHasCodeEnv}
                    />
                </EditCodeResubmitProvider>
            </Stack>
        </Box>
    )
}
