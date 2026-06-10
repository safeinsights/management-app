import type { Story } from '@ladle/react'
import { pageBackgroundArgTypes } from '../../../../.ladle/backgrounds'
import { EmptyState } from './empty-state'

const meta = { title: 'Feedback / Empty state', argTypes: pageBackgroundArgTypes }
export default meta

// Copy varies across every audience x scope combination (see MESSAGES in empty-state.tsx).
// One story per combination so the catalog shows all four distinct strings.

export const UserReviewer: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <EmptyState scope="user" audience="reviewer" />
    </div>
)

export const UserResearcher: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <EmptyState scope="user" audience="researcher" />
    </div>
)

export const OrgReviewer: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <EmptyState scope="org" audience="reviewer" />
    </div>
)

export const OrgResearcher: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <EmptyState scope="org" audience="researcher" />
    </div>
)
