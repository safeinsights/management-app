import { Box, Stack } from '@mantine/core'
import { notFound } from 'next/navigation'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { Routes } from '@/lib/routes'
import { db } from '@/database'
import { displayOrgName } from '@/lib/string'
import { fetchLatestCodeEnvForStudyIdOrNull, latestJobForStudyOrNull } from '@/server/db/queries'
import { getCodeReviewFeedbackAction, getStudyAction } from '@/server/actions/study.actions'
import { EditCodeResubmitProvider } from '@/contexts/edit-code-resubmit'
import { ResubmitCodeProvider } from '@/contexts/resubmit-code'
import { ResubmitStudyCodeForm } from './form'
import { EditStudyCodeView } from './edit-study-code-view'
import { FeatureFlagGate } from './feature-flag-gate'
import { NotFoundOnMount } from './not-found-on-mount'

const ALLOWED_LATEST_JOB_STATUSES = new Set(['CODE-CHANGES-REQUESTED', 'JOB-ERRORED', 'RUN-COMPLETE', 'FILES-REJECTED'])

export default async function ResubmitStudyCodePage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params
    const study = await getStudyAction({ studyId })

    if ('error' in study || !study.submittedByOrgSlug || study.title === null) {
        return notFound()
    }

    const latestJob = await latestJobForStudyOrNull(studyId)
    const latestJobStatus = latestJob?.statusChanges.at(0)?.status ?? null

    return (
        <FeatureFlagGate
            defaultContent={
                <ResubmitCodeProvider
                    study={{ ...study, title: study.title, submittedByOrgSlug: study.submittedByOrgSlug }}
                >
                    <Stack p="xl" gap="xl">
                        <PageBreadcrumbs
                            crumbs={[
                                ['Dashboard', Routes.dashboard],
                                [study.title, Routes.studyView({ orgSlug, studyId })],
                                ['Resubmit study code'],
                            ]}
                        />
                        <ResubmitStudyCodeForm />
                    </Stack>
                </ResubmitCodeProvider>
            }
            optInContent={
                <EditAndResubmitOptIn
                    studyId={studyId}
                    orgSlug={orgSlug}
                    studyTitle={study.title}
                    submittedAt={study.submittedAt}
                    enclaveOrgId={study.orgId}
                    latestJobStatus={latestJobStatus}
                    codeResubmissionNoteDraft={study.codeResubmissionNoteDraft ?? null}
                />
            }
        />
    )
}

interface EditAndResubmitOptInProps {
    studyId: string
    orgSlug: string
    studyTitle: string
    submittedAt: Date | null
    enclaveOrgId: string
    latestJobStatus: string | null
    codeResubmissionNoteDraft: string | null
}

async function EditAndResubmitOptIn({
    studyId,
    orgSlug,
    studyTitle,
    submittedAt,
    enclaveOrgId,
    latestJobStatus,
    codeResubmissionNoteDraft,
}: EditAndResubmitOptInProps) {
    // Guards run client-side via NotFoundOnMount so the non-opted-in branch
    // (which still renders this OptIn server component into the client gate's
    // prop tree) doesn't 404 the whole page when the status check fails.
    if (!latestJobStatus || !ALLOWED_LATEST_JOB_STATUSES.has(latestJobStatus)) return <NotFoundOnMount />

    const feedbackResult = await getCodeReviewFeedbackAction({ studyId })
    if ('error' in feedbackResult) return <NotFoundOnMount />
    const feedbackEntries = feedbackResult

    const enclaveOrg = await db.selectFrom('org').select('name').where('id', '=', enclaveOrgId).executeTakeFirst()
    const orgName = displayOrgName(enclaveOrg?.name ?? '')

    const studyHasCodeEnv = (await fetchLatestCodeEnvForStudyIdOrNull(studyId)) != null

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xl" py="xl">
                <PageBreadcrumbs
                    crumbs={[
                        ['Dashboard', Routes.dashboard],
                        ['Study proposal', Routes.studySubmitted({ orgSlug, studyId })],
                        ['Study code', Routes.studyView({ orgSlug, studyId })],
                        ['Edit study code'],
                    ]}
                />
                <EditCodeResubmitProvider studyId={studyId} initialNote={codeResubmissionNoteDraft ?? ''}>
                    <EditStudyCodeView
                        studyId={studyId}
                        studyTitle={studyTitle}
                        orgName={orgName}
                        submittedAt={submittedAt}
                        feedbackEntries={feedbackEntries}
                        studyHasCodeEnv={studyHasCodeEnv}
                    />
                </EditCodeResubmitProvider>
            </Stack>
        </Box>
    )
}
