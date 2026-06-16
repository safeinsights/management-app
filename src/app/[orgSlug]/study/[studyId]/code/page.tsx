'use server'

import { Stack } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getDraftStudyAction } from '@/server/actions/study-request'
import { getStudyAction } from '@/server/actions/study.actions'
import { studyHasJobStatus } from '@/lib/studies'
import { isActionError } from '@/lib/errors'
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

    // OTTER-533: this first-submission upload page must not be reachable once code has been submitted
    // (e.g. via back-navigation from a later step). Re-submitting here overwrites the prior submission
    // and wipes results under review — send the researcher to the read-only study view instead.
    const study = await getStudyAction({ studyId })
    if (!isActionError(study) && study && studyHasJobStatus(study, 'CODE-SUBMITTED')) {
        redirect(Routes.studyView({ orgSlug, studyId }))
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
                        ? Routes.studyAgreements({ orgSlug, studyId, from: 'previous' })
                        : Routes.studyEdit({ orgSlug, studyId })
                }
            />
        </Stack>
    )
}
