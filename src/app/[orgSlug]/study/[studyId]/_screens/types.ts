import type { Route } from 'next'
import type { PhasedStepNav, RawStudyState, ScreenDescriptor, StepNav } from '@/lib/study-screen'
import type { SelectedStudy } from '@/server/actions/study.actions'

export type ScreenComponentProps = {
    descriptor: ScreenDescriptor
    study: SelectedStudy
    raw: RawStudyState
    orgSlug: string
    dashboardHref: Route
    // Threaded onto back/forward routes so the researcher stays in org scope across hops.
    returnTo?: 'org'
    // Resolved once by the dispatcher from the nav table (OTTER-673); screens render it, never derive it.
    nav: StepNav
    // The same nav split for the security-key screens: only Previous while the outputs are locked.
    phasedNav: PhasedStepNav
}
