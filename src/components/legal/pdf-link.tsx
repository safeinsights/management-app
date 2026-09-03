import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { Text } from '@mantine/core'
import { LinkWithIcon } from '../links'
import { EMPTY_CELL } from '@/lib/dates'
import { type FC } from 'react'

// Null carries through from an unsigned row, so table callers need no guard of their own.
export const PdfLink: FC<{ url: string | null; label?: string }> = ({ url, label = 'PDF' }) => {
    if (!url) return <Text c="dimmed">{EMPTY_CELL}</Text>

    return (
        <LinkWithIcon href={url} target="_blank" rel="noreferrer" icon={<ArrowSquareOutIcon size={14} />}>
            {label}
        </LinkWithIcon>
    )
}
