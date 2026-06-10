import type { Story } from '@ladle/react'
import { Box } from '@mantine/core'
import { GreyCanvas } from '../../../../.ladle/decorators/grey-canvas'
import DashboardSkeleton, { TableSkeleton } from './dashboard'
import NavbarSkeleton from './navbar'

// The loading-state skeletons. The dashboard/table skeletons render over the app's grey page
// canvas; the navbar skeleton renders over the purple sidebar background it appears on in-app.
const meta = { title: 'Layout / Skeletons' }
export default meta

export const Dashboard: Story = () => (
    <GreyCanvas>
        <DashboardSkeleton />
    </GreyCanvas>
)

export const Table: Story = () => (
    <GreyCanvas>
        <TableSkeleton />
    </GreyCanvas>
)

export const TableNoActionButton: Story = () => (
    <GreyCanvas>
        <TableSkeleton showActionButton={false} />
    </GreyCanvas>
)

export const Navbar: Story = () => (
    <Box bg="purple.8" w={260} h="100vh" pt="md">
        <NavbarSkeleton />
    </Box>
)
