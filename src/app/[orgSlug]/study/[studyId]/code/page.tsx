'use server'

import type { Metadata } from 'next'
import { Stack } from '@mantine/core'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { getDraftStudyAction } from '@/server/actions/study-request'
import { cleanupCoderDevFiles } from '@/server/dev'
import { redirect } from 'next/navigation'
import { CodeUploadPage } from './code-upload'
import { codeSubmissionNav } from '@/lib/study-screen'
import { Routes } from '@/lib/routes'
import { displayOrgName } from '@/lib/string'
import { hasViewedSubmitCodeFaq } from '@/server/db/queries'
import { sessionFromClerk } from '@/server/clerk'
import { ensureStarterCodePreloadAction } from '@/server/actions/workspaces.actions'
import logger from '@/lib/logger'

export async function generateMetadata(): Promise<Metadata> {
    return { title: 'Study code' }
}

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

    // OTTER-693: the Data Partner's template has to be in the workspace before the table renders.
    // Best-effort: the copy reads from S3, and a study whose starter code is missing should still
    // get a working page rather than an error.
    const preload = await ensureStarterCodePreloadAction({ studyId })
    if ('error' in preload) logger.warn(`starter-code pre-load skipped for study ${studyId}: ${preload.error}`)

    // Read on the server so the FAQ renders in its final state on first paint rather than popping
    // open after hydration. getDraftStudyAction has already authorised the view; this only ever
    // reads the caller's own history.
    const session = await sessionFromClerk()
    const isFirstVisit = session ? !(await hasViewedSubmitCodeFaq(session.user.id)) : false

    return (
        <Stack p="xl" gap="xl">
            <StudyPageHeader study={result} />
            <CodeUploadPage
                orgSlug={orgSlug}
                studyId={studyId}
                // study.orgId is the enclave org, so orgName is the Data Partner the code will run
                // against — not the submitting lab. Same source /resubmit reads.
                dataPartnerName={displayOrgName(result.orgName)}
                isFirstVisit={isFirstVisit}
                nav={codeSubmissionNav(result.status, { orgSlug, studyId })}
            />
        </Stack>
    )
}
