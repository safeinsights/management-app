'use server'

import { Routes } from '@/lib/routes'
import { redirect } from 'next/navigation'

// OTTER-727 hid the Agreements step; this route only catches stale bookmarks. /review runs the
// shared reviewer access guard, so no preamble is needed here.
export default async function ReviewerAgreementsRoute(props: {
    params: Promise<{ orgSlug: string; studyId: string }>
}) {
    const { orgSlug, studyId } = await props.params
    redirect(Routes.studyReview({ orgSlug, studyId }))
}
