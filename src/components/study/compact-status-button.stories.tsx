import type { Story } from '@ladle/react'
import { Group } from '@mantine/core'
import { CheckCircleIcon, XCircleIcon, ClockIcon } from '@phosphor-icons/react/dist/ssr'
import { CompactStatusButton } from './compact-status-button'

const meta = { title: 'Study / CompactStatusButton' }
export default meta

export const Default: Story = () => (
    <Group p="xl">
        <CompactStatusButton
            icon={<CheckCircleIcon size={14} weight="fill" />}
            primaryText="Approve"
            secondaryText="Share results"
            color="green"
        />
    </Group>
)

export const WithColors: Story = () => (
    <Group p="xl">
        <CompactStatusButton
            icon={<CheckCircleIcon size={14} weight="fill" />}
            primaryText="Approve code"
            secondaryText="Run in enclave"
            color="green"
        />
        <CompactStatusButton
            icon={<XCircleIcon size={14} weight="fill" />}
            primaryText="Reject code"
            secondaryText="Request revision"
            color="red"
        />
        <CompactStatusButton
            icon={<ClockIcon size={14} weight="fill" />}
            primaryText="Pending review"
            secondaryText="Awaiting reviewer"
            color="blue"
        />
    </Group>
)

export const NoIcon: Story = () => (
    <Group p="xl">
        <CompactStatusButton primaryText="Submit code" secondaryText="For review" />
    </Group>
)

export const Loading: Story = () => (
    <Group p="xl">
        <CompactStatusButton primaryText="Approve" secondaryText="Share results" color="green" loading />
    </Group>
)

export const Disabled: Story = () => (
    <Group p="xl">
        <CompactStatusButton
            icon={<CheckCircleIcon size={14} weight="fill" />}
            primaryText="Approve"
            secondaryText="Share results"
            color="green"
            disabled
        />
    </Group>
)
