import type { Story } from '@ladle/react'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import DashboardSkeleton, { TableSkeleton } from './dashboard'

const meta = { title: 'Layout / Skeletons', argTypes: pageBackgroundArgTypes }
export default meta

export const Dashboard: Story = () => <DashboardSkeleton />

export const Table: Story = () => <TableSkeleton />

export const TableNoActionButton: Story = () => <TableSkeleton showActionButton={false} />
