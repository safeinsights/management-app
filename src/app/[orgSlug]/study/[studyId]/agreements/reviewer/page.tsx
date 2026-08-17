'use server'

import { Routes } from '@/lib/routes'
import { redirect } from 'next/navigation'

// OTTER-727: the Agreements step is hidden. Nothing links here any more, so this route exists only to
// catch stale bookmarks, browser history and old emails — it redirects to the canonical reviewer
// screen (bare /review re-resolves to code review) instead of rendering the placeholder. /review runs
// the shared reviewer access guard, so no session/ability preamble is needed here.
export default async function ReviewerAgreementsRoute(props: {
    params: Promise<{ orgSlug: string; studyId: string }>
}) {
    const { orgSlug, studyId } = await props.params
    redirect(Routes.studyReview({ orgSlug, studyId }))
}
