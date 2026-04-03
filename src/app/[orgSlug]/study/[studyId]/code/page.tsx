'use server'

import { Stack, Title } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getDraftStudyAction } from '@/server/actions/study-request'
import { redirect } from 'next/navigation'
import { CodeUploadPage } from './code-upload'
import { Routes } from '@/lib/routes'

export default async function StudyCodeUploadRoute(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    // Fetch draft study data
    const result = await getDraftStudyAction({ studyId })

    if ('error' in result) {
        redirect(Routes.studyView({ orgSlug, studyId }))
    }

    // Verify language is set (required for code upload)
    if (!result.language) {
        // If no language, redirect back to edit to complete proposal
        redirect(Routes.studyEdit({ orgSlug, studyId }))
    }

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    orgSlug,
                    studyId,
                    studyTitle: result.title,
                    current: 'Upload code',
                }}
            />
            <Title order={1}>Upload your study code</Title>
            <CodeUploadPage
                studyId={studyId}
                orgSlug={result.orgSlug}
                language={result.language}
                existingMainFile={result.mainCodeFileName}
                existingAdditionalFiles={result.additionalCodeFileNames}
                previousHref={
                    result.status === 'APPROVED'
                        ? Routes.studyAgreements({ orgSlug, studyId })
                        : Routes.studyEdit({ orgSlug, studyId })
                }
            />
        </Stack>
    )
}
