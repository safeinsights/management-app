import { Stack, Title } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction } from '@/server/actions/study.actions'
import { ResubmitStudyCodeForm } from './form'
import { isActionError } from '@/lib/errors'
import { notFound } from 'next/navigation'

export default async function ResubmitStudyCodePage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug: _orgSlug } = await props.params
    const study = await getStudyAction({ studyId })

    if (isActionError(study)) {
        return notFound()
    }

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId,
                    current: 'Resubmit study code',
                }}
            />
            <Title order={1}>Resubmit study code</Title>
            <ResubmitStudyCodeForm study={study} />
        </Stack>
    )
}
