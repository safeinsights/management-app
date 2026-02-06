'use server'

import { Stack, Title } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getDraftStudyAction } from '@/server/actions/study-request'
import { notFound, redirect } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { Step2Form } from './step2-form'

export default async function StudyProposalRoute(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    const result = await getDraftStudyAction({ studyId })

    if ('error' in result) {
        return notFound()
    }

    if (result.status !== 'DRAFT') {
        redirect(Routes.studyReview({ orgSlug, studyId }))
    }

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    orgSlug,
                    studyId,
                    current: 'Step 2',
                }}
            />
            <Title order={1}>Request data use</Title>
            <Step2Form studyId={studyId} orgSlug={orgSlug} />
        </Stack>
    )
}
