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

// Screens are awaited rather than rendered as JSX children so async server components resolve in
// the test harness.
export async function renderStudyScreen(args: RenderArgs & { role: StudyRole }): Promise<React.JSX.Element> {
    const descriptor = resolveScreen(args.role, projectStudyState(args.raw))
    return renderScreen(descriptor, args)
}

export async function renderResearcherCodeStep(args: RenderArgs): Promise<React.JSX.Element> {
    const descriptor = resolveResearcherCodeScreen(projectStudyState(args.raw))
    if (!descriptor) notFound()
    return renderScreen(descriptor, args)
}

export async function renderReviewerCodeStep(args: RenderArgs): Promise<React.JSX.Element> {
    const descriptor = resolveReviewerCodeScreen(projectStudyState(args.raw))
    if (!descriptor) notFound()
    return renderScreen(descriptor, args)
}
