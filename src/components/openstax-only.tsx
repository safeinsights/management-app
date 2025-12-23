import { FC, ReactNode } from 'react'
import { OPENSTAX_ORG_SLUGS } from '@/lib/constants'

interface OpenStaxOnlyProps {
    orgSlug: string
    children: ReactNode
}

export const OpenStaxOnly: FC<OpenStaxOnlyProps> = ({ orgSlug, children }) => {
    if (!isOpenStaxOrg(orgSlug)) {
        return null
    }

    return children
}

export const isOpenStaxOrg = (orgSlug: string): boolean => {
    return OPENSTAX_ORG_SLUGS.includes(orgSlug as (typeof OPENSTAX_ORG_SLUGS)[number])
}
