'use client'

import type { FC } from '@/common'
import { LinkWithIcon } from '@/components/links'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'

// Local copy: sharing it would couple this page's merge to another open branch.
export const PdfCell: FC<{ downloadUrl: string }> = ({ downloadUrl }) => (
    <LinkWithIcon href={downloadUrl} target="_blank" rel="noreferrer" icon={<ArrowSquareOutIcon size={14} />}>
        PDF
    </LinkWithIcon>
)
