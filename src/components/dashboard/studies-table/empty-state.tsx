import { Stack, Text } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { LinkWithIcon } from '@/components/links'
import { ExternalLinks } from '@/lib/routes'
import type { Audience } from './types'

// The lab copy serves the RL dashboard and the Researcher tab, the review copy the DP dashboard and
// the Reviewer tab.
const EMPTY_COPY: Record<Audience, { paragraphs: string[]; linkLabel: string; href: string; maw: number }> = {
    researcher: {
        paragraphs: [
            'A study lets you run your own code to conduct secondary analysis on a Data Partner’s data inside a secure enclave. You never see the underlying data, only the outputs it produces.',
            'Every study follows four steps: set up your study, explore with example data and submit a proposal, develop and submit your code, and verify your outputs.',
        ],
        linkLabel: 'Learn how to set up a study',
        href: ExternalLinks.studyLifecycle,
        maw: 480,
    },
    reviewer: {
        paragraphs: [
            "A study lets researchers run code against your organization's data inside a secure enclave, producing analytical outputs without ever exposing the underlying raw data.",
            'Studies require your review at three stages: proposal, code, and outputs. Studies submitted to your organization will appear here.',
        ],
        linkLabel: 'Learn more about the review process',
        href: ExternalLinks.reviewProcess,
        maw: 496,
    },
}

export function EmptyState({ audience, isVisible }: { audience: Audience; isVisible: boolean }) {
    if (!isVisible) return null
    const copy = EMPTY_COPY[audience]

    return (
        <Stack gap="md" pt="xxl" maw={copy.maw} mx="auto" align="flex-start">
            <Stack gap="xs">
                {copy.paragraphs.map((paragraph) => (
                    <Text key={paragraph} fz="md">
                        {paragraph}
                    </Text>
                ))}
            </Stack>
            <LinkWithIcon
                href={copy.href}
                target="_blank"
                rel="noopener noreferrer"
                icon={<ArrowSquareOutIcon size={16} weight="bold" />}
            >
                {copy.linkLabel}
            </LinkWithIcon>
        </Stack>
    )
}
