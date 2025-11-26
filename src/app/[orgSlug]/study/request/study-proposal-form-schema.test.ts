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

        it('requires language to be selected with custom error message', () => {
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

        it('validates complete form with language', () => {
            const result = studyProposalFormSchema.safeParse({
                ...validFormData,
                language: 'R',
            })

            expect(result.success).toBe(true)
        })
    })
})

describe('studyProposalApiSchema', () => {
    describe('language field', () => {
        const validApiData = {
            title: 'Valid Test Title',
            piName: 'Test PI',
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
