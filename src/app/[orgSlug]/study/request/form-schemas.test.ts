import { describe, it, expect } from 'vitest'
import {
    DATA_PARTNER_REQUIRED_ERROR,
    PROGRAMMING_LANGUAGE_REQUIRED_ERROR,
    STUDY_TITLE_BLANK_ERROR,
    STUDY_TITLE_MAX_CHARACTERS,
    STUDY_TITLE_OVER_LIMIT_ERROR,
    draftStudyApiSchema,
    step1FieldsSchema,
    studyProposalFormSchema,
    studyProposalApiSchema,
} from './form-schemas'
import { BLANK_UUID } from '@/tests/unit.helpers'

const VALID_STEP_1 = { title: 'A study', orgSlug: 'test-org', language: 'R' as const }

const messagesFor = (value: unknown, path: string) => {
    const result = step1FieldsSchema.safeParse(value)
    if (result.success) return []
    return result.error.issues.filter((issue) => issue.path.includes(path)).map((issue) => issue.message)
}

describe('step1FieldsSchema', () => {
    // OTTER-647: a rule for a field Step 1 does not render fails with nothing able to display it.
    it('validates with only the fields Step 1 renders', () => {
        expect(step1FieldsSchema.safeParse(VALID_STEP_1).success).toBe(true)
    })

    it('requires a Data Partner with the exact message', () => {
        expect(messagesFor({ ...VALID_STEP_1, orgSlug: '' }, 'orgSlug')).toEqual([DATA_PARTNER_REQUIRED_ERROR])
    })

    describe('title', () => {
        it('accepts a single character', () => {
            expect(step1FieldsSchema.safeParse({ ...VALID_STEP_1, title: 'A' }).success).toBe(true)
        })

        it('reports the blank message for an empty title', () => {
            expect(messagesFor({ ...VALID_STEP_1, title: '' }, 'title')).toEqual([STUDY_TITLE_BLANK_ERROR])
        })

        it('treats a whitespace-only title as empty', () => {
            expect(messagesFor({ ...VALID_STEP_1, title: '     ' }, 'title')).toEqual([STUDY_TITLE_BLANK_ERROR])
        })

        it('accepts exactly 60 characters', () => {
            expect(step1FieldsSchema.safeParse({ ...VALID_STEP_1, title: 'a'.repeat(60) }).success).toBe(true)
        })

        it('counts characters rather than words', () => {
            const multiWord = 'one two three four five six seven eight nine ten eleven twel'
            expect(multiWord).toHaveLength(60)
            expect(step1FieldsSchema.safeParse({ ...VALID_STEP_1, title: multiWord }).success).toBe(true)
        })

        it('rejects 61 characters with the interpolated limit in the message', () => {
            expect(messagesFor({ ...VALID_STEP_1, title: 'a'.repeat(61) }, 'title')).toEqual([
                STUDY_TITLE_OVER_LIMIT_ERROR,
            ])
            expect(STUDY_TITLE_OVER_LIMIT_ERROR).toBe(
                'Study title exceeds the 60 character limit. Shorten it to continue.',
            )
            expect(STUDY_TITLE_MAX_CHARACTERS).toBe(60)
        })

        it('excludes surrounding whitespace from the limit', () => {
            expect(messagesFor({ ...VALID_STEP_1, title: `  ${'a'.repeat(60)}  ` }, 'title')).toEqual([])
        })

        it('counts interior whitespace toward the limit', () => {
            const spaced = `${'a'.repeat(30)} ${'b'.repeat(30)}`
            expect(spaced).toHaveLength(61)
            expect(messagesFor({ ...VALID_STEP_1, title: spaced }, 'title')).toEqual([STUDY_TITLE_OVER_LIMIT_ERROR])
        })
    })

    describe('language', () => {
        it('requires a language once a Data Partner is selected', () => {
            expect(messagesFor({ ...VALID_STEP_1, language: null }, 'language')).toEqual([
                PROGRAMMING_LANGUAGE_REQUIRED_ERROR,
            ])
        })

        // The field renders nothing until a Data Partner is chosen, so an error here could be
        // neither seen nor cleared.
        it('does not require a language while no Data Partner is selected', () => {
            expect(messagesFor({ ...VALID_STEP_1, orgSlug: '', language: null }, 'language')).toEqual([])
        })

        it('reports the title and Data Partner problems together', () => {
            const result = step1FieldsSchema.safeParse({ title: '', orgSlug: '', language: null })
            expect(result.success).toBe(false)
            if (result.success) return
            const paths = result.error.issues.map((issue) => issue.path.join('.'))
            expect(paths).toContain('title')
            expect(paths).toContain('orgSlug')
        })
    })
})

describe('studyProposalFormSchema', () => {
    it('carries the Step 2 fields on top of the Step 1 shape', () => {
        const result = studyProposalFormSchema.safeParse({
            orgSlug: 'test-org',
            language: 'R',
            title: 'Valid Test Title',
            piName: 'Test PI',
        })

        expect(result.success).toBe(true)
    })
})

// The title cap is deliberately absent so an autosave can still carry a title that predates it;
// the submit actions apply the cap (OTTER-737).
describe('draftStudyApiSchema', () => {
    it('accepts a title longer than the cap, so a pre-cap row can still autosave', () => {
        expect(draftStudyApiSchema.safeParse({ title: 'a'.repeat(200) }).success).toBe(true)
    })

    it('accepts a title at the limit, and a null one for an untitled draft', () => {
        expect(draftStudyApiSchema.safeParse({ title: 'a'.repeat(60) }).success).toBe(true)
        expect(draftStudyApiSchema.safeParse({ title: null }).success).toBe(true)
        expect(draftStudyApiSchema.safeParse({}).success).toBe(true)
    })
})

describe('studyProposalApiSchema', () => {
    describe('language field', () => {
        const validApiData = {
            title: 'Valid Test Title',
            piName: 'Test PI',
            piUserId: BLANK_UUID,
            language: 'R',
            descriptionDocPath: '/path/to/description.pdf',
            irbDocPath: '/path/to/irb.pdf',
            agreementDocPath: '/path/to/agreement.pdf',
            mainCodeFilePath: '/path/to/main.R',
            additionalCodeFilePaths: [],
        }

        it('validates complete API payload', () => {
            const result = studyProposalApiSchema.safeParse(validApiData)

            expect(result.success).toBe(true)
        })

        it('requires language field', () => {
            const { language, ...dataWithoutLanguage } = validApiData
            const result = studyProposalApiSchema.safeParse(dataWithoutLanguage)

            expect(result.success).toBe(false)
            if (!result.success) {
                const languageError = result.error.issues.find((e) => e.path.includes('language'))
                expect(languageError).toBeDefined()
            }
        })
    })
})
