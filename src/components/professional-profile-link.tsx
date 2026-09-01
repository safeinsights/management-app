'use client'

import type { FC } from 'react'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { LinkWithIcon } from '@/components/links'
import { Routes } from '@/lib/routes'

type ProfessionalProfileLinkProps = {
    /** Omitted for a PI recorded by name only; an empty id would link to the wrong profile. */
    userId?: string | null
    studyId: string
    orgSlug: string
}

export const ProfessionalProfileLink: FC<ProfessionalProfileLinkProps> = ({ userId, studyId, orgSlug }) => {
    if (!userId) return null

    return (
        <LinkWithIcon
            href={Routes.researcherProfileView({ orgSlug, studyId, userId })}
            target="_blank"
            rel="noopener noreferrer"
            icon={<ArrowSquareOutIcon size={14} />}
        >
            Professional profile
        </LinkWithIcon>
    )
}
