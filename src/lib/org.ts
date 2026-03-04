export function getEnclaveSlug(slug: string): string {
    return slug.endsWith('-lab') ? slug.slice(0, -4) : slug
}

export function getLabSlug(slug: string): string {
    return slug.endsWith('-lab') ? slug : `${slug}-lab`
}
