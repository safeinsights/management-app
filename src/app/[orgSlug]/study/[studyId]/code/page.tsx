'use server'

import { Stack } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getDraftStudyAction } from '@/server/actions/study-request'
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
