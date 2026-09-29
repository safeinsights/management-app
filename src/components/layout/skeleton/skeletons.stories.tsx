import type { Story } from '@ladle/react'
import { Box } from '@mantine/core'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import DashboardSkeleton, { TableSkeleton } from './dashboard'
import NavbarSkeleton from './navbar'
import { SIDENAV_BG } from '@/lib/constants'

const meta = { title: 'Layout / Skeletons', argTypes: pageBackgroundArgTypes }
export default meta

export const Dashboard: Story = () => <DashboardSkeleton />

export const Table: Story = () => <TableSkeleton />

export const TableNoActionButton: Story = () => <TableSkeleton showActionButton={false} />

export const Navbar: Story = () => (
    <Box bg={SIDENAV_BG} w={260} h="100vh" pt="md">
        <NavbarSkeleton />
    </Box>
)
