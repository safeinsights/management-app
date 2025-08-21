import { Stack, Title } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction } from '@/server/actions/study.actions'
import { ResubmitStudyCodeForm } from './form'


export default async function ResubmitStudyCodePage({ params }: { params: { studyId: string; orgSlug: string } }) {
    const { studyId, orgSlug } = params
    const study = await getStudyAction({ studyId })

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
