import type { Story } from '@ladle/react'
import { Group, Stack } from '@mantine/core'
import { ButtonLink, Link } from './links'
import type { Route } from 'next'

// Sanity story exercising a REAL app component through the next/link shim + the
// real theme — confirms the Ladle pipeline matches the app.
const meta = { title: 'Components / Links' }
export default meta

const href = '/dashboard' as Route

export const Buttons: Story = () => (
    <Group p="xl">
        <ButtonLink href={href}>Propose New Study</ButtonLink>
        <ButtonLink href={href} variant="outline">
            Secondary
        </ButtonLink>
        <ButtonLink href={href} disabled>
            Disabled
        </ButtonLink>
    </Group>
)

export const Anchors: Story = () => (
    <Stack p="xl">
        <Link href={href}>An inline anchor link</Link>
        <Link href={'https://safeinsights.org' as Route} target="_blank">
            An external link
        </Link>
    </Stack>
)
