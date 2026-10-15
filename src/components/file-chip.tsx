import { Badge, BadgeProps } from '@mantine/core'
import { DownloadIcon } from '@phosphor-icons/react/dist/ssr'
import { FC } from 'react'
import { truncate } from '@/lib/string'
import { semanticColor } from '@/theme/tokens'
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
            color={semanticColor('brand.light')}
            c={semanticColor('text.primary')}
            component="a"
            href={href}
            target="_blank"
            rightSection={<DownloadIcon />}
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
