'use client'

import type { FC } from 'react'
import { Anchor } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Routes } from '@/lib/routes'

type ProfessionalProfileLinkProps = {
    /**
     * Omitted for a PI recorded by name only: `study.piUserId` is nullable, and a link with an
     * empty id would resolve to the wrong person's profile page.
     */
    userId?: string | null
    studyId: string
    orgSlug: string
}

export const ProfessionalProfileLink: FC<ProfessionalProfileLinkProps> = ({ userId, studyId, orgSlug }) => {
    if (!userId) return null

    return (
        <Anchor
            href={`${Routes.researcherProfileView({ orgSlug, studyId })}?userId=${userId}`}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            fw={600}
            c="blue.7"
            display="inline-flex"
            w="fit-content"
            style={{ alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
            data-testid="professional-profile-link"
        >
            Professional profile
            <ArrowSquareOutIcon size={14} />
        </Anchor>
    )
}
