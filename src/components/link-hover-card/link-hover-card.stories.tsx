import type { Story } from '@ladle/react'
import { Paper, Stack, Text } from '@mantine/core'
import { LinkHoverCard } from './link-hover-card'
import { LinkEditForm } from './link-edit-form'
import type { LinkPreview } from './link-preview'

const meta = { title: 'Editor / Link hover card' }
export default meta

const HREF = 'https://app.qa.safeinsights.org/openstax-lab/study/01a0011e-b0b2-7618-9ca5-5caa61bc30d3/view'

const noop = () => {}

const Frame = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <Stack gap="xs">
        <Text fz={12} fw={700}>
            {label}
        </Text>
        <Paper w={420} p="sm" radius="md" shadow="md" withBorder={false}>
            {children}
        </Paper>
    </Stack>
)

const Board = ({ children }: { children: React.ReactNode }) => (
    <Stack gap="xl" p="xl" bg="grey.10">
        {children}
    </Stack>
)

const external: LinkPreview = { kind: 'external', href: HREF }
const internal: LinkPreview = {
    kind: 'internal',
    href: HREF,
    title: 'Study: The effect of study environment on student concentration and learning',
    category: 'OpenStax',
}
const unavailable: LinkPreview = { kind: 'unavailable', href: HREF }
const loading: LinkPreview = { kind: 'loading', href: HREF }

export const EditMode: Story = () => (
    <Board>
        <Frame label="External link">
            <LinkHoverCard
                preview={external}
                mode="edit"
                opensInNewTab
                onOpenInNewTab={noop}
                onEdit={noop}
                onRemove={noop}
            />
        </Frame>
        <Frame label="Internal link">
            <LinkHoverCard
                preview={internal}
                mode="edit"
                opensInNewTab
                onOpenInNewTab={noop}
                onEdit={noop}
                onRemove={noop}
            />
        </Frame>
        <Frame label="Internal link that cannot be opened">
            <LinkHoverCard
                preview={unavailable}
                mode="edit"
                opensInNewTab
                onOpenInNewTab={noop}
                onEdit={noop}
                onRemove={noop}
            />
        </Frame>
        <Frame label="Internal link, title still resolving">
            <LinkHoverCard
                preview={loading}
                mode="edit"
                opensInNewTab
                onOpenInNewTab={noop}
                onEdit={noop}
                onRemove={noop}
            />
        </Frame>
    </Board>
)

export const ReadOnlyMode: Story = () => (
    <Board>
        <Frame label="Stored to open in a new tab">
            <LinkHoverCard preview={internal} mode="readOnly" opensInNewTab onOpenInNewTab={noop} />
        </Frame>
        <Frame label="Not stored to open in a new tab">
            <LinkHoverCard preview={internal} mode="readOnly" opensInNewTab={false} onOpenInNewTab={noop} />
        </Frame>
        <Frame label="External link">
            <LinkHoverCard preview={external} mode="readOnly" opensInNewTab onOpenInNewTab={noop} />
        </Frame>
    </Board>
)

export const EditForm: Story = () => (
    <Board>
        <Frame label="Edit link">
            <LinkEditForm initialText="hyperlinked text" initialUrl={HREF} onCancel={noop} onSave={noop} />
        </Frame>
        <Frame label="Edit link, invalid URL (press Save to see the error)">
            <LinkEditForm initialText="hyperlinked text" initialUrl="not a url" onCancel={noop} onSave={noop} />
        </Frame>
    </Board>
)
