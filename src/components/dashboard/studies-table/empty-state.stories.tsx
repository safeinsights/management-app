import type { Story } from '@ladle/react'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { EmptyState } from './empty-state'

const meta = { title: 'Feedback / Empty state', argTypes: pageBackgroundArgTypes }
export default meta

export const ResearchLab: Story = () => (
    <div style={{ padding: 24, maxWidth: 960 }}>
        <EmptyState audience="researcher" isVisible />
    </div>
)

export const DataPartner: Story = () => (
    <div style={{ padding: 24, maxWidth: 960 }}>
        <EmptyState audience="reviewer" isVisible />
    </div>
)
