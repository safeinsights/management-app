import type { RawStudyState, ScreenDescriptor } from '@/lib/study-screen'
import type { SelectedStudy } from '@/server/actions/study.actions'

export type ScreenComponentProps = {
    descriptor: ScreenDescriptor
    study: SelectedStudy
    raw: RawStudyState
    orgSlug: string
    dashboardHref: string
    // Org-scoped entry (?returnTo=org); leaves thread it onto their own back/forward routes so the
    // researcher stays in org scope across hops.
    returnTo?: 'org'
}
