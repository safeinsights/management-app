import { OPENSTAX_ORG_SLUGS } from '@/lib/constants'

export const isFeatureFlagOrg = (orgSlug: string): boolean =>
    OPENSTAX_ORG_SLUGS.includes(orgSlug as (typeof OPENSTAX_ORG_SLUGS)[number])

export function getEnclaveSlug(slug: string): string {
    return slug.endsWith('-lab') ? slug.slice(0, -4) : slug
}

export function getLabSlug(slug: string): string {
    return slug.endsWith('-lab') ? slug : `${slug}-lab`
}
