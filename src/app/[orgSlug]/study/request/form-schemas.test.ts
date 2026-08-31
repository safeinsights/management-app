import { describe, it, expect } from 'vitest'
import { step1FieldsSchema, studyProposalFormSchema, studyProposalApiSchema } from './form-schemas'
import { BLANK_UUID } from '@/tests/unit.helpers'

describe('step1FieldsSchema', () => {
    it('requires language to be selected with custom error message', () => {
        const result = step1FieldsSchema.safeParse({ orgSlug: 'test-org', language: null })

        expect(result.success).toBe(false)
        if (!result.success) {
            const languageError = result.error.issues.find((e) => e.path.includes('language'))
            expect(languageError).toBeDefined()
            expect(languageError?.message).toBe('Programming language is required')
        }
    })

    it('requires a Data Partner with custom error message', () => {
        const result = step1FieldsSchema.safeParse({ orgSlug: '', language: 'R' })

        expect(result.success).toBe(false)
        if (!result.success) {
            const orgError = result.error.issues.find((e) => e.path.includes('orgSlug'))
            expect(orgError?.message).toBe('Data Partner is required')
        }
    })

    // OTTER-647: Step 1 renders only the Data Partner and language fields. If this schema
    // ever requires more, the extra rules fail with no field able to display them.
    it('validates with only the fields Step 1 renders', () => {
        const result = step1FieldsSchema.safeParse({ orgSlug: 'test-org', language: 'R' })

        expect(result.success).toBe(true)
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
