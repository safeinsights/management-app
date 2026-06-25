import type React from 'react'
import { projectStudyState, resolveScreen, type RawStudyState, type StudyRole } from '@/lib/study-screen'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { SCREEN_COMPONENTS } from './registry'

// Shared dispatch for both /view (researcher) and /review (reviewer): project → resolve → look up
// → render. Screens are awaited (not rendered as JSX children) so async server components resolve
// in the test harness, matching the pattern the /view page used inline before this helper existed.
export async function renderStudyScreen(args: {
    role: StudyRole
    raw: RawStudyState
    study: SelectedStudy
    orgSlug: string
    studyId: string
    dashboardHref: string
    returnTo?: 'org'
    // Read-only wizard step from ?step= (researcher /view): lets the resolver surface an earlier
    // screen of an advanced study. Ignored when the study has not reached that step.
    step?: string
}): Promise<React.JSX.Element> {
    const descriptor = resolveScreen(args.role, projectStudyState(args.raw), args.step, {
        orgSlug: args.orgSlug,
        studyId: args.studyId,
        returnTo: args.returnTo,
    })
    const Screen = SCREEN_COMPONENTS[descriptor.screen]
    return (await Screen({
        descriptor,
        study: args.study,
        raw: args.raw,
        orgSlug: args.orgSlug,
        dashboardHref: args.dashboardHref,
        returnTo: args.returnTo,
    })) as React.JSX.Element
}
