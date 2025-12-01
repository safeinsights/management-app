import { describe, it, expect } from 'vitest'
import type { OrgWithLanguages } from '@/lib/types'
import { filterOrgsForStudySelector } from './study-org-selector'

const makeOrg = (overrides: Partial<OrgWithLanguages> = {}): OrgWithLanguages =>
    ({
        slug: 'default-slug',
        name: 'Default Org',
        type: 'enclave',
        supportedLanguages: [],
        hasNoBaseImages: false,
        isSingleLanguage: false,
        ...overrides,
    }) as OrgWithLanguages

describe('filterOrgsForStudySelector', () => {
    it('returns an empty array when orgs is undefined', () => {
        const result = filterOrgsForStudySelector(undefined)
        expect(result).toEqual([])
    })

    it('returns an empty array when orgs is empty', () => {
        const result = filterOrgsForStudySelector([])
        expect(result).toEqual([])
    })

    it('includes only enclave orgs with base images', () => {
        const orgs: OrgWithLanguages[] = [
            makeOrg({
                slug: 'enclave-with-images',
                type: 'enclave',
                hasNoBaseImages: false,
                supportedLanguages: ['R'],
            }),
            makeOrg({
                slug: 'enclave-no-images',
                type: 'enclave',
                hasNoBaseImages: true,
                supportedLanguages: [],
            }),
            makeOrg({
                slug: 'lab-with-images',
                type: 'lab',
                hasNoBaseImages: false,
                supportedLanguages: ['R'],
            }),
        ]

        const result = filterOrgsForStudySelector(orgs)

        expect(result.map((o) => o.slug)).toEqual(['enclave-with-images'])
    })

    it('includes enclave orgs with multiple supported languages', () => {
        const orgs: OrgWithLanguages[] = [
            makeOrg({
                slug: 'multi-lang-enclave',
                type: 'enclave',
                hasNoBaseImages: false,
                supportedLanguages: ['R', 'PYTHON'],
            }),
        ]

        const result = filterOrgsForStudySelector(orgs)

        expect(result).toHaveLength(1)
        expect(result[0].slug).toBe('multi-lang-enclave')
        expect(result[0].supportedLanguages).toEqual(['R', 'PYTHON'])
    })

    it('excludes enclave orgs that report hasNoBaseImages even if supportedLanguages is non-empty', () => {
        const orgs: OrgWithLanguages[] = [
            makeOrg({
                slug: 'mismatched-flags',
                type: 'enclave',
                hasNoBaseImages: true,
                supportedLanguages: ['R'],
            }),
        ]

        const result = filterOrgsForStudySelector(orgs)

        expect(result).toEqual([])
    })
})
