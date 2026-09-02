'use server'

import { Stack } from '@mantine/core'
import { getDraftStudyAction } from '@/server/actions/study-request'
import { cleanupCoderDevFiles } from '@/server/dev'
import { redirect } from 'next/navigation'
import { CodeUploadPage } from './code-upload'
import { Routes } from '@/lib/routes'
import { displayOrgName } from '@/lib/string'
import { db } from '@/database'
import { sessionFromClerk } from '@/server/clerk'

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

    // Read on the server so the FAQ renders in its correct state on first paint rather than
    // popping open after a client fetch. getDraftStudyAction has already authorised the view;
    // this only ever reads the caller's own row. The client marks it seen once mounted.
    const session = await sessionFromClerk()
    const viewer = session
        ? await db.selectFrom('user').select('submitCodeFaqSeenAt').where('id', '=', session.user.id).executeTakeFirst()
        : null

    return (
        <Stack p="xl" gap="xl">
            <CodeUploadPage
                orgSlug={orgSlug}
                studyId={studyId}
                // study.orgId is the enclave org, so orgName is the Data Partner the code will run
                // against — not the submitting lab. Same source /resubmit reads.
                dataPartnerName={displayOrgName(result.orgName)}
                isFirstVisit={!viewer?.submitCodeFaqSeenAt}
                previousHref={
                    result.status === 'APPROVED'
                        ? Routes.studySubmitted({ orgSlug, studyId })
                        : Routes.studyEdit({ orgSlug, studyId })
                }
            />
        </Stack>
    )
}
