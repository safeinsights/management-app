import { describe, it, expect } from 'vitest'
import { studyProposalFormSchema, studyProposalApiSchema } from './study-proposal-form-schema'

describe('studyProposalFormSchema', () => {
    describe('language field', () => {
        const validFormData = {
            orgSlug: 'test-org',
            title: 'Valid Test Title',
            piName: 'Test PI',
            descriptionDocument: new File(['test'], 'description.pdf', { type: 'application/pdf' }),
            irbDocument: new File(['test'], 'irb.pdf', { type: 'application/pdf' }),
            agreementDocument: new File(['test'], 'agreement.pdf', { type: 'application/pdf' }),
        }

        it('requires language to be selected', () => {
            const result = studyProposalFormSchema.safeParse({
                ...validFormData,
                language: null,
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                const languageError = result.error.issues.find((e) => e.path.includes('language'))
                expect(languageError).toBeDefined()
                expect(languageError?.message).toBe('Programming language is required')
            }
        })

        it('accepts R as a valid language', () => {
            const result = studyProposalFormSchema.safeParse({
                ...validFormData,
                language: 'R',
            })

            expect(result.success).toBe(true)
        })

        it('accepts PYTHON as a valid language', () => {
            const result = studyProposalFormSchema.safeParse({
                ...validFormData,
                language: 'PYTHON',
            })

            expect(result.success).toBe(true)
        })

        it('rejects invalid language values', () => {
            const result = studyProposalFormSchema.safeParse({
                ...validFormData,
                language: 'JAVA',
            })

            expect(result.success).toBe(false)
        })

        it('rejects empty string as language', () => {
            const result = studyProposalFormSchema.safeParse({
                ...validFormData,
                language: '',
            })

            expect(result.success).toBe(false)
        })

        it('rejects undefined language', () => {
            const result = studyProposalFormSchema.safeParse({
                ...validFormData,
                language: undefined,
            })

            expect(result.success).toBe(false)
        })
    })
})

describe('studyProposalApiSchema', () => {
    describe('language field', () => {
        const validApiData = {
            title: 'Valid Test Title',
            piName: 'Test PI',
            descriptionDocPath: '/path/to/description.pdf',
            irbDocPath: '/path/to/irb.pdf',
            agreementDocPath: '/path/to/agreement.pdf',
            mainCodeFilePath: '/path/to/main.R',
            additionalCodeFilePaths: [],
        }

        it('accepts R as a valid language', () => {
            const result = studyProposalApiSchema.safeParse({
                ...validApiData,
                language: 'R',
            })

            expect(result.success).toBe(true)
        })

        it('accepts PYTHON as a valid language', () => {
            const result = studyProposalApiSchema.safeParse({
                ...validApiData,
                language: 'PYTHON',
            })

            expect(result.success).toBe(true)
        })

        it('rejects invalid language values', () => {
            const result = studyProposalApiSchema.safeParse({
                ...validApiData,
                language: 'JAVA',
            })

            expect(result.success).toBe(false)
        })

        it('requires language field', () => {
            const result = studyProposalApiSchema.safeParse(validApiData)

            expect(result.success).toBe(false)
            if (!result.success) {
                const languageError = result.error.issues.find((e) => e.path.includes('language'))
                expect(languageError).toBeDefined()
            }
        })

        it('rejects null as language', () => {
            const result = studyProposalApiSchema.safeParse({
                ...validApiData,
                language: null,
            })

            expect(result.success).toBe(false)
        })
    })
})
