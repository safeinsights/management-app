import type { Story } from '@ladle/react'
import { PageBreadcrumbs, OrgBreadcrumbs, ResearcherBreadcrumbs } from './page-breadcrumbs'

const meta = { title: 'Navigation / Breadcrumbs' }
export default meta

// PageBreadcrumbs: each crumb is [label, href?]. With an href it renders a link,
// without one it renders the current (non-link) page label.

export const PageDefault: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <PageBreadcrumbs
            crumbs={[['Dashboard', '/dashboard'], ['Study review', '/openstax/study/abc/review'], ['Results']]}
        />
    </div>
)

export const PageSingleCurrent: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <PageBreadcrumbs crumbs={[['Dashboard']]} />
    </div>
)

// Links truncate at maw=300; a long label exercises the truncation styling.
export const PageWithLongLabel: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <PageBreadcrumbs
            crumbs={[
                ['Dashboard', '/dashboard'],
                [
                    'A study with an extremely long title that should be truncated by the breadcrumb width constraint',
                    '/openstax/study/abc/view',
                ],
                ['Review submitted results for the latest analysis job that produced these output files'],
            ]}
        />
    </div>
)

// OrgBreadcrumbs builds crumbs from a structured object using the Routes helpers.
export const OrgDashboardOnly: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <OrgBreadcrumbs crumbs={{ orgSlug: 'openstax' }} />
    </div>
)

export const OrgWithStudy: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <OrgBreadcrumbs
            crumbs={{
                orgSlug: 'openstax',
                studyId: '11111111-1111-4111-8111-111111111111',
                studyTitle: 'Reading comprehension cohort',
            }}
        />
    </div>
)

export const OrgWithStudyAndCurrent: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <OrgBreadcrumbs
            crumbs={{
                orgSlug: 'openstax',
                studyId: '11111111-1111-4111-8111-111111111111',
                studyTitle: 'Reading comprehension cohort',
                current: 'Results',
            }}
        />
    </div>
)

export const OrgWithLongStudyTitle: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <OrgBreadcrumbs
            crumbs={{
                orgSlug: 'openstax',
                studyId: '11111111-1111-4111-8111-111111111111',
                studyTitle:
                    'A longitudinal study of student reading comprehension outcomes across multiple semesters and demographics',
                current: 'Review',
            }}
        />
    </div>
)

// ResearcherBreadcrumbs is the researcher-side equivalent; dashboardHref overrides the root crumb.
export const ResearcherDashboardOnly: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <ResearcherBreadcrumbs crumbs={{ orgSlug: 'openstax' }} />
    </div>
)

export const ResearcherWithStudyAndCurrent: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <ResearcherBreadcrumbs
            crumbs={{
                orgSlug: 'openstax',
                studyId: '11111111-1111-4111-8111-111111111111',
                studyTitle: 'Reading comprehension cohort',
                current: 'Edit',
            }}
        />
    </div>
)

export const ResearcherWithCustomDashboardHref: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <ResearcherBreadcrumbs
            crumbs={{
                orgSlug: 'openstax',
                dashboardHref: '/researcher/dashboard',
                studyId: '11111111-1111-4111-8111-111111111111',
                studyTitle: 'Reading comprehension cohort',
                current: 'Upload code',
            }}
        />
    </div>
)

export const ResearcherWithLongStudyTitle: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <ResearcherBreadcrumbs
            crumbs={{
                orgSlug: 'openstax',
                studyId: '11111111-1111-4111-8111-111111111111',
                studyTitle:
                    'A longitudinal study of student reading comprehension outcomes across multiple semesters and demographics',
                current: 'Results',
            }}
        />
    </div>
)
