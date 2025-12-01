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
    it('returns empty state when no org is provided', () => {
        const state: ProgrammingLanguageUiState = deriveProgrammingLanguageUiState({
            org: null,
            isAdmin: false,
        })

        expect(state.orgName).toBe('')
        expect(state.isSingleLanguage).toBe(false)
        expect(state.options).toEqual([])
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
            org,
            isAdmin: false,
        })

        expect(state.orgName).toBe('Single Language Org')
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
            org,
            isAdmin: false,
        })

        expect(state.orgName).toBe('Multi Language Org')
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
            org: baseOrg,
            isAdmin: false,
        })

        expect(nonAdminState.options).toEqual(['R'])
        expect(nonAdminState.isSingleLanguage).toBe(true)

        const adminState: ProgrammingLanguageUiState = deriveProgrammingLanguageUiState({
            org: baseOrg,
            isAdmin: true,
        })

        expect(adminState.options).toEqual(['R', 'PYTHON'])
        expect(adminState.isSingleLanguage).toBe(false)
        expect(adminState.orgName).toBe('Admin Org')
    })
})