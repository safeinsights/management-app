import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { LinkWithIcon } from '../links'
import { type FC } from 'react'

export const PdfLink: FC<{ url: string; label: string }> = ({ url, label }) => (
    <LinkWithIcon href={url} target="_blank" rel="noreferrer" icon={<ArrowSquareOutIcon size={14} />}>
        {label}
    </LinkWithIcon>
)
