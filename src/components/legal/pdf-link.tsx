import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { Text } from '@mantine/core'
import { LinkWithIcon, type LinkWithIconProps } from '../links'
import { EMPTY_CELL } from '@/lib/dates'
import { legalDocumentDownloadURL } from '@/lib/paths'
import { type FC } from 'react'

// Anything else reaches the link itself, so a Tooltip can wrap it.
type PdfLinkProps = Omit<LinkWithIconProps, 'href' | 'icon' | 'children' | 'target' | 'rel'> & {
    label?: string
    withIcon?: boolean
}

// Null carries through from an unsigned row, so table callers need no guard of their own.
export const PdfLink: FC<PdfLinkProps & { url: string | null }> = ({
    url,
    label = 'PDF',
    withIcon = true,
    ...linkProps
}) => {
    if (!url) return <Text c="dimmed">{EMPTY_CELL}</Text>

    return (
        <LinkWithIcon
            {...linkProps}
            href={url}
            target="_blank"
            rel="noreferrer"
            icon={withIcon ? <ArrowSquareOutIcon size={14} /> : null}
        >
            {label}
        </LinkWithIcon>
    )
}

// The route presigns on request, so a table of these costs no signatures until one is clicked.
export const LegalDocumentPdfLink: FC<PdfLinkProps & { versionId: string | null }> = ({ versionId, ...props }) => {
    const url = versionId ? legalDocumentDownloadURL(versionId) : null

    return <PdfLink url={url} {...props} />
}
