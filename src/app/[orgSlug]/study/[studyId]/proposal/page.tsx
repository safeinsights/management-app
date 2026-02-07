'use server'

import { Stack } from '@mantine/core'
import { getDraftStudyAction } from '@/server/actions/study-request'
import { notFound, redirect } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { Step2Form } from './step2-form'
import { StudyRequestPageHeader } from '../../request/page-header'
import { displayOrgName } from '@/lib/string'

export default async function StudyProposalRoute(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    const result = await getDraftStudyAction({ studyId })

    if ('error' in result) {
        return notFound()
    }

    if (result.status !== 'DRAFT') {
        redirect(Routes.studyReview({ orgSlug, studyId }))
    }

    // TODO: Fetch datasets for the org

    return (
        <Stack p="xl" gap="xl">
            <StudyRequestPageHeader orgSlug={orgSlug} />
            <Step2Form
                orgName={displayOrgName(result.orgName)}
                datasets={[]}
                initialValues={{
                    title: result.title || '',
                }}
            />
        </Stack>
    )
}
