import type { Story } from '@ladle/react'
import { Box } from '@mantine/core'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { PageHeader } from './page-header'

const meta = { title: 'Components / Page header', argTypes: pageBackgroundArgTypes }
export default meta

const Frame = ({ children }: { children: React.ReactNode }) => (
    <Box style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>{children}</Box>
)

export const StudyPage: Story = () => (
    <Frame>
        <PageHeader eyebrow="Genius" title="Impact of highlighting on student learning outcomes" />
    </Frame>
)

export const OrganizationPage: Story = () => (
    <Frame>
        <PageHeader eyebrow="Genius" title="Manage team" />
    </Frame>
)

export const NoEyebrow: Story = () => (
    <Frame>
        <PageHeader title="My dashboard" />
    </Frame>
)

export const UntitledStudy: Story = () => (
    <Frame>
        <PageHeader eyebrow="Untitled" title="Untitled study" />
    </Frame>
)
