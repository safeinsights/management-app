import { describe, it, expect } from 'vitest'
import type { OrgWithLanguages } from '@/lib/types'
import { deriveProgrammingLanguageUiState, type ProgrammingLanguageUiState } from './programming-language-section'

const createOrg = (overrides: Partial<OrgWithLanguages> = {}): OrgWithLanguages =>
    ({
        slug: 'test-org-slug',
        name: 'Test Org',
        type: 'enclave',
        supportedLanguages: [],
        hasNoBaseImages: false,
        isSingleLanguage: false,
        ...overrides,
    }) as OrgWithLanguages

describe('deriveProgrammingLanguageUiState', () => {
    it('returns fallback state when no matching org is found', () => {
        const state: ProgrammingLanguageUiState = deriveProgrammingLanguageUiState({
            orgs: [],
            selectedOrgSlug: 'missing-slug',
            isAdmin: false,
        })

        expect(state.orgName).toBe('this data organization')
        expect(state.hasNoBaseImages).toBe(true)
        expect(state.isSingleLanguage).toBe(false)
        expect(state.options).toEqual(['R', 'PYTHON'])
    })

    it('derives single-language state for a non-admin org with one supported language', () => {
        const org = createOrg({
            slug: 'org-1',
            name: 'Single Language Org',
            supportedLanguages: ['PYTHON'],
            hasNoBaseImages: false,
            isSingleLanguage: true,
        })

        const state: ProgrammingLanguageUiState = deriveProgrammingLanguageUiState({
            orgs: [org],
            selectedOrgSlug: 'org-1',
            isAdmin: false,
        })

        expect(state.orgName).toBe('Single Language Org')
        expect(state.hasNoBaseImages).toBe(false)
        expect(state.isSingleLanguage).toBe(true)
        expect(state.options).toEqual(['PYTHON'])
    })

    it('derives multi-language state for a non-admin org with both R and Python', () => {
        const org = createOrg({
            slug: 'org-2',
            name: 'Multi Language Org',
            supportedLanguages: ['R', 'PYTHON'],
            hasNoBaseImages: false,
            isSingleLanguage: false,
        })

        const state: ProgrammingLanguageUiState = deriveProgrammingLanguageUiState({
            orgs: [org],
            selectedOrgSlug: 'org-2',
            isAdmin: false,
        })

        expect(state.orgName).toBe('Multi Language Org')
        expect(state.hasNoBaseImages).toBe(false)
        expect(state.isSingleLanguage).toBe(false)
        expect(state.options).toEqual(['R', 'PYTHON'])
    })

    it('derives no-base-images state when an org has no supported languages', () => {
        const org = createOrg({
            slug: 'org-3',
            name: 'No Images Org',
            supportedLanguages: [],
            hasNoBaseImages: true,
            isSingleLanguage: false,
        })

        const state: ProgrammingLanguageUiState = deriveProgrammingLanguageUiState({
            orgs: [org],
            selectedOrgSlug: 'org-3',
            isAdmin: false,
        })

        expect(state.orgName).toBe('No Images Org')
        expect(state.hasNoBaseImages).toBe(true)
        expect(state.isSingleLanguage).toBe(false)
        expect(state.options).toEqual(['R', 'PYTHON'])
    })

    it('allows admins to always see both R and Python and disables single-language auto-select', () => {
        const baseOrg = createOrg({
            slug: 'org-5',
            name: 'Admin Org',
            supportedLanguages: ['R'],
            hasNoBaseImages: false,
            isSingleLanguage: true,
        })

        const nonAdminState: ProgrammingLanguageUiState = deriveProgrammingLanguageUiState({
            orgs: [baseOrg],
            selectedOrgSlug: 'org-5',
            isAdmin: false,
        })

        expect(nonAdminState.options).toEqual(['R'])
        expect(nonAdminState.isSingleLanguage).toBe(true)
        expect(nonAdminState.hasNoBaseImages).toBe(false)

        const adminState: ProgrammingLanguageUiState = deriveProgrammingLanguageUiState({
            orgs: [baseOrg],
            selectedOrgSlug: 'org-5',
            isAdmin: true,
        })

        expect(adminState.options).toEqual(['R', 'PYTHON'])
        expect(adminState.isSingleLanguage).toBe(false)
        expect(adminState.hasNoBaseImages).toBe(false)
    })
})
