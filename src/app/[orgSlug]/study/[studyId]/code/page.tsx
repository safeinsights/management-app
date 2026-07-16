'use server'

import { Stack } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getDraftStudyAction } from '@/server/actions/study-request'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { canResearcherResubmitCode, projectStudyState } from '@/lib/study-screen'
import { cleanupCoderDevFiles } from '@/server/dev'
import { redirect } from 'next/navigation'
import { CodeUploadPage } from './code-upload'
import { Routes } from '@/lib/routes'

export default async function StudyCodeUploadRoute(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    await cleanupCoderDevFiles()

    const result = await getDraftStudyAction({ studyId })

    if ('error' in result) {
        redirect(Routes.studyView({ orgSlug, studyId }))
    }

    if (!result.language) {
        redirect(Routes.studyEdit({ orgSlug, studyId }))
    }

    // OTTER-636: /code is the initial code-submit page. Once a review decision has landed (change
    // requested, or a results decision), revising belongs on the resubmit flow, which carries the
    // required resubmission note. Without this, a fresh post-decision draft round routed here via the
    // dashboard could bypass that note. Re-submitting within the same un-reviewed round stays here.
    const codeRaw = await rawStudyStateForStudy(studyId)
    if (codeRaw && canResearcherResubmitCode(projectStudyState(codeRaw))) {
        redirect(Routes.studyResubmit({ orgSlug, studyId }))
    }

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    orgSlug,
                    studyId,
                    studyTitle: result.title,
                    current: 'Provide code',
                }}
            />
            <CodeUploadPage
                orgSlug={orgSlug}
                studyId={studyId}
                studyTitle={result.title}
                previousHref={
                    result.status === 'APPROVED'
                        ? Routes.studyResearcherAgreements({ orgSlug, studyId })
                        : Routes.studyEdit({ orgSlug, studyId })
                }
            />
        </Stack>
    )
}
