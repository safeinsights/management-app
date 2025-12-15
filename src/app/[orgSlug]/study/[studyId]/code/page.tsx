'use server'

import { Stack, Title } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getDraftStudyAction } from '@/server/actions/study-request'
import { notFound, redirect } from 'next/navigation'
import { CodeUploadPage } from './step2-code-upload'
import { Routes } from '@/lib/routes'

export default async function StudyCodeUploadRoute(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
}) {
    const { studyId, orgSlug } = await props.params

    // Fetch draft study data
    const result = await getDraftStudyAction({ studyId })

    if ('error' in result) {
        return notFound()
    }

    // Verify study is in DRAFT status
    if (result.status !== 'DRAFT') {
        // If not a draft, redirect to the review page
        redirect(Routes.studyReview({ orgSlug, studyId }))
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
                    orgSlug: result.orgSlug,
                    studyId,
                    current: 'Upload code',
                }}
            />
            <Title order={1}>Upload your study code</Title>
            <CodeUploadPage
                studyId={studyId}
                orgSlug={result.orgSlug}
                submittingOrgSlug={orgSlug}
                language={result.language}
                existingMainFile={result.mainCodeFileName}
                existingAdditionalFiles={result.additionalCodeFileNames}
            />
        </Stack>
    )
}
