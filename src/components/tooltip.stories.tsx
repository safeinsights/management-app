import type { Story } from '@ladle/react'
import { Group, Stack, Text } from '@mantine/core'
import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { InfoTooltip } from './tooltip'

// InfoTooltip wraps Mantine Tooltip and guarantees its children sit inside a single
// span. Hover the targets below to reveal each tooltip.
const meta = { title: 'Components / Info tooltip' }
export default meta

export const Default: Story = () => (
    <Group p="xl">
        <InfoTooltip label="This proposal is now ready for review.">
            <Text>Hover me</Text>
        </InfoTooltip>
    </Group>
)

export const WithIcon: Story = () => (
    <Group p="xl">
        <InfoTooltip label="Approved! Study results have now been shared with the Researcher.">
            <InfoIcon size={20} />
        </InfoTooltip>
    </Group>
)

export const Multiline: Story = () => (
    <Stack p="xl" align="flex-start">
        <InfoTooltip
            label="This study code has been approved and is now being prepared to run in the enclave. No further action is needed at this time."
            multiline
            styles={{ tooltip: { maxWidth: 250 } }}
        >
            <Text>Long, wrapping tooltip</Text>
        </InfoTooltip>
    </Stack>
)
