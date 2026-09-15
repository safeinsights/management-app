import type React from 'react'
import { notFound } from 'next/navigation'
import type { Route } from 'next'
import {
    phasedStepNav,
    projectStudyState,
    resolveScreen,
    resolveScreenNav,
    resolveResearcherCodeScreen,
    resolveReviewerCodeScreen,
    type NavCtx,
    type PhasedStepNav,
    type RawStudyState,
    type ScreenDescriptor,
    type ScreenId,
    type StepNav,
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

// The nav is resolved here, once, so no screen re-derives it from state. Exported for screen tests,
// which call a screen directly and need the same props the dispatcher would pass.
export function screenNavProps(
    role: StudyRole,
    screen: ScreenId,
    raw: RawStudyState,
    ctx: NavCtx,
): { nav: StepNav; phasedNav: PhasedStepNav } {
    const nav = resolveScreenNav(role, screen, projectStudyState(raw), ctx)
    return { nav, phasedNav: phasedStepNav(nav) }
}

// Screens are awaited rather than rendered as JSX children so async server components resolve in
// the test harness.
export async function renderScreenById(
    descriptor: ScreenDescriptor,
    args: RenderArgs & { role: StudyRole },
): Promise<React.JSX.Element> {
    const Screen = SCREEN_COMPONENTS[descriptor.screen]
    const navProps = screenNavProps(args.role, descriptor.screen, args.raw, {
        orgSlug: args.orgSlug,
        studyId: args.study.id,
        dashboardHref: args.dashboardHref,
        returnTo: args.returnTo,
    })
    return (await Screen({
        descriptor,
        study: args.study,
        raw: args.raw,
        orgSlug: args.orgSlug,
        dashboardHref: args.dashboardHref,
        returnTo: args.returnTo,
        ...navProps,
    })) as React.JSX.Element
}

export async function renderStudyScreen(args: RenderArgs & { role: StudyRole }): Promise<React.JSX.Element> {
    const descriptor = resolveScreen(args.role, projectStudyState(args.raw))
    return renderScreenById(descriptor, args)
}

export async function renderResearcherCodeStep(args: RenderArgs): Promise<React.JSX.Element> {
    const descriptor = resolveResearcherCodeScreen(projectStudyState(args.raw))
    if (!descriptor) notFound()
    return renderScreenById(descriptor, { ...args, role: 'researcher' })
}

export async function renderReviewerCodeStep(args: RenderArgs): Promise<React.JSX.Element> {
    const descriptor = resolveReviewerCodeScreen(projectStudyState(args.raw))
    if (!descriptor) notFound()
    return renderScreenById(descriptor, { ...args, role: 'reviewer' })
}
