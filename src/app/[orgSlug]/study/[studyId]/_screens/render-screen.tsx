import type React from 'react'
import { notFound } from 'next/navigation'
import type { Route } from 'next'
import {
    projectStudyState,
    resolveScreen,
    resolveResearcherCodeScreen,
    resolveReviewerCodeScreen,
    type RawStudyState,
    type ScreenDescriptor,
    type StudyRole,
} from '@/lib/study-screen'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { SCREEN_COMPONENTS } from './registry'

type RenderArgs = {
    raw: RawStudyState
    study: SelectedStudy
    orgSlug: string
    dashboardHref: Route
    returnTo?: 'org'
}

async function renderScreen(descriptor: ScreenDescriptor, args: RenderArgs): Promise<React.JSX.Element> {
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

// Shared dispatch for both /view (researcher) and /review (reviewer): project → resolve → look up
// → render. Screens are awaited (not rendered as JSX children) so async server components resolve
// in the test harness, matching the pattern the /view page used inline before this helper existed.
export async function renderStudyScreen(
    args: RenderArgs & { role: StudyRole; studyId: string },
): Promise<React.JSX.Element> {
    const descriptor = resolveScreen(args.role, projectStudyState(args.raw), {
        orgSlug: args.orgSlug,
        studyId: args.studyId,
        returnTo: args.returnTo,
    })
    return renderScreen(descriptor, args)
}

// /view/code dispatch: the read-only code screen, even after the study advanced to results. 404s
// when the study hasn't reached the code stage (no forward jumps).
export async function renderResearcherCodeStep(args: RenderArgs): Promise<React.JSX.Element> {
    const descriptor = resolveResearcherCodeScreen(projectStudyState(args.raw))
    if (!descriptor) notFound()
    return renderScreen(descriptor, args)
}

// /review/code dispatch: the reviewer counterpart, walked back to from the results screen. Same
// 404-when-not-yet-code contract as the researcher step.
export async function renderReviewerCodeStep(args: RenderArgs): Promise<React.JSX.Element> {
    const descriptor = resolveReviewerCodeScreen(projectStudyState(args.raw))
    if (!descriptor) notFound()
    return renderScreen(descriptor, args)
}
