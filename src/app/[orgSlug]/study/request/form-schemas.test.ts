import { describe, it, expect } from 'vitest'
import {
    DATA_PARTNER_REQUIRED_ERROR,
    PROGRAMMING_LANGUAGE_REQUIRED_ERROR,
    STUDY_TITLE_BLANK_ERROR,
    STUDY_TITLE_MAX_CHARACTERS,
    STUDY_TITLE_OVER_LIMIT_ERROR,
    step1DraftStudyApiSchema,
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
    // OTTER-647: Step 1 renders exactly the title, Data Partner and language fields. If this
    // schema ever requires more, the extra rules fail with no field able to display them.
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

        // The limit is characters, not words: a 60-character multi-word title must pass where a
        // 20-word rule would have failed it.
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

        // The cap is measured raw so the validator and the character counter can never disagree.
        it('measures the limit on the raw value, not the trimmed one', () => {
            expect(messagesFor({ ...VALID_STEP_1, title: `${'a'.repeat(60)} ` }, 'title')).toEqual([
                STUDY_TITLE_OVER_LIMIT_ERROR,
            ])
        })
    })

    describe('language', () => {
        it('requires a language once a Data Partner is selected', () => {
            expect(messagesFor({ ...VALID_STEP_1, language: null }, 'language')).toEqual([
                PROGRAMMING_LANGUAGE_REQUIRED_ERROR,
            ])
        })

        // The field renders nothing until a Data Partner is chosen, so an error here would be one
        // the user can neither see nor clear, and Continue would flag nothing and do nothing.
        it('does not require a language while no Data Partner is selected', () => {
            expect(messagesFor({ ...VALID_STEP_1, orgSlug: '', language: null }, 'language')).toEqual([])
        })

        // Both must surface on one click, not just the first.
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

describe('step1DraftStudyApiSchema', () => {
    it('rejects a title over the character limit', () => {
        const result = step1DraftStudyApiSchema.safeParse({ title: 'a'.repeat(61) })

        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0].message).toBe(STUDY_TITLE_OVER_LIMIT_ERROR)
    })

    it('accepts a title at the limit', () => {
        expect(step1DraftStudyApiSchema.safeParse({ title: 'a'.repeat(60) }).success).toBe(true)
    })

    // Creation is the only entry point that mints a study row, so it is the one place that can
    // stop an untitled row existing at all. The parent schema stays permissive for the update and
    // resubmit paths, which must not clear a title they do not own.
    it('rejects a create payload with no usable title', () => {
        expect(step1DraftStudyApiSchema.safeParse({}).success).toBe(false)
        expect(step1DraftStudyApiSchema.safeParse({ title: null }).success).toBe(false)

        const blank = step1DraftStudyApiSchema.safeParse({ title: '   ' })
        expect(blank.success).toBe(false)
        if (blank.success) return
        expect(blank.error.issues[0].message).toBe(STUDY_TITLE_BLANK_ERROR)
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
