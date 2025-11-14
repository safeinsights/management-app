import { Badge, BadgeProps } from '@mantine/core'
import { DownloadIcon } from '@phosphor-icons/react/dist/ssr'
import { FC } from 'react'
import { truncate } from '@/lib/string'
import { InfoTooltip } from './tooltip'

type FileChipProps = Omit<BadgeProps, 'component' | 'href'> & {
    href: string
    filename: string
}

export const FileChip: FC<FileChipProps> = ({ href, filename, ...badgeProps }) => {
    const truncatedText = truncate(filename)
    const needsTooltip = filename.length > 20

    const badge = (
        <Badge
            color="#D4D1F3"
            c="black"
            tt="none"
            component="a"
            href={href}
            target="_blank"
            rightSection={<DownloadIcon />}
            style={{ cursor: 'pointer' }}
            {...badgeProps}
        >
            {truncatedText}
        </Badge>
    )

    if (needsTooltip) {
        return <InfoTooltip label={filename}>{badge}</InfoTooltip>
    }

    return badge
}
