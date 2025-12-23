import { Stack, Title } from '@mantine/core'
import { notFound } from 'next/navigation'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction } from '@/server/actions/study.actions'
import { ResubmitCodeProvider } from '@/contexts/resubmit-code'
import { ResubmitStudyCodeForm } from './form'

export default async function ResubmitStudyCodePage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params
    const study = await getStudyAction({ studyId })

    if ('error' in study || !study.submittedByOrgSlug) {
        return notFound()
    }

    return (
        <ResubmitCodeProvider study={{ ...study, submittedByOrgSlug: study.submittedByOrgSlug }}>
            <Stack p="xl" gap="xl">
                <ResearcherBreadcrumbs
                    crumbs={{
                        orgSlug,
                        studyId,
                        current: 'Resubmit study code',
                    }}
                />
                <Title order={1}>Resubmit study code</Title>
                <ResubmitStudyCodeForm />
            </Stack>
        </ResubmitCodeProvider>
    )
}
