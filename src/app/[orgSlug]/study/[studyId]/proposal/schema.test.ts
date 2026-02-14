import { describe, it, expect } from 'vitest'
import { proposalFormSchema, initialProposalValues, WORD_LIMITS } from './schema'

function lexicalText(text: string): string {
    return JSON.stringify({ root: { type: 'text', text } })
}

function words(count: number): string {
    return Array(count)
        .fill('word')
        .join(' ')
}

const validProposalData = {
    title: 'Valid Study Title',
    datasets: [] as string[],
    researchQuestions: lexicalText('What is the primary research question?'),
    projectSummary: lexicalText('This study examines the relationship between variables.'),
    impact: lexicalText('Findings will inform educational practice.'),
    additionalNotes: '',
    piName: 'Jane Smith',
}

describe('proposalFormSchema', () => {
    describe('title', () => {
        it('validates valid title', () => {
            const result = proposalFormSchema.safeParse(validProposalData)
            expect(result.success).toBe(true)
        })

        it('rejects empty title', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                title: '',
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                const error = result.error.issues.find((e) => e.path.includes('title'))
                expect(error?.message).toBe('This field is required.')
            }
        })

        it('rejects title exceeding word limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                title: words(WORD_LIMITS.title + 1),
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                const error = result.error.issues.find((e) => e.path.includes('title'))
                expect(error?.message).toBe('Word limit exceeded. Please shorten your text.')
            }
        })

        it('accepts title at exactly word limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                title: words(WORD_LIMITS.title),
            })
            expect(result.success).toBe(true)
        })
    })

    describe('researchQuestions', () => {
        it('rejects empty Lexical content', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                researchQuestions: lexicalText(''),
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                const error = result.error.issues.find((e) => e.path.includes('researchQuestions'))
                expect(error?.message).toBe('This field is required.')
            }
        })

        it('rejects invalid JSON', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                researchQuestions: 'not valid json',
            })

            expect(result.success).toBe(false)
        })

        it('rejects content exceeding word limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                researchQuestions: lexicalText(words(WORD_LIMITS.researchQuestions + 1)),
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                const error = result.error.issues.find((e) => e.path.includes('researchQuestions'))
                expect(error?.message).toBe('Word limit exceeded. Please shorten your text.')
            }
        })

        it('accepts content at exactly word limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                researchQuestions: lexicalText(words(WORD_LIMITS.researchQuestions)),
            })
            expect(result.success).toBe(true)
        })
    })

    describe('projectSummary', () => {
        it('rejects empty Lexical content', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                projectSummary: lexicalText(''),
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                const error = result.error.issues.find((e) => e.path.includes('projectSummary'))
                expect(error?.message).toBe('This field is required.')
            }
        })

        it('rejects content exceeding word limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                projectSummary: lexicalText(words(WORD_LIMITS.projectSummary + 1)),
            })

            expect(result.success).toBe(false)
        })

        it('accepts content at word limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                projectSummary: lexicalText(words(WORD_LIMITS.projectSummary)),
            })
            expect(result.success).toBe(true)
        })
    })

    describe('impact', () => {
        it('rejects empty Lexical content', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                impact: lexicalText(''),
            })

            expect(result.success).toBe(false)
        })

        it('rejects content exceeding word limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                impact: lexicalText(words(WORD_LIMITS.impact + 1)),
            })

            expect(result.success).toBe(false)
        })
    })

    describe('additionalNotes', () => {
        it('accepts empty string', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                additionalNotes: '',
            })
            expect(result.success).toBe(true)
        })

        it('accepts when omitted and defaults to empty string', () => {
            const { additionalNotes, ...data } = validProposalData
            const result = proposalFormSchema.safeParse(data)
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.additionalNotes).toBe('')
            }
        })

        it('rejects content exceeding word limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                additionalNotes: lexicalText(words(WORD_LIMITS.additionalNotes + 1)),
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                const error = result.error.issues.find((e) => e.path.includes('additionalNotes'))
                expect(error?.message).toBe('Word limit exceeded. Please shorten your text.')
            }
        })

        it('accepts content at word limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                additionalNotes: lexicalText(words(WORD_LIMITS.additionalNotes)),
            })
            expect(result.success).toBe(true)
        })
    })

    describe('piName', () => {
        it('rejects empty piName', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                piName: '',
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                const error = result.error.issues.find((e) => e.path.includes('piName'))
                expect(error?.message).toBe('This field is required.')
            }
        })

        it('accepts valid piName', () => {
            const result = proposalFormSchema.safeParse(validProposalData)
            expect(result.success).toBe(true)
        })
    })

    describe('datasets', () => {
        it('defaults to empty array when omitted', () => {
            const { datasets, ...data } = validProposalData
            const result = proposalFormSchema.safeParse(data)
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.datasets).toEqual([])
            }
        })

        it('accepts array of dataset IDs', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                datasets: ['dataset-1', 'dataset-2'],
            })
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.datasets).toEqual(['dataset-1', 'dataset-2'])
            }
        })
    })

    describe('initialProposalValues', () => {
        it('fails validation (required fields empty)', () => {
            const result = proposalFormSchema.safeParse(initialProposalValues)
            expect(result.success).toBe(false)
        })

        it('has correct shape', () => {
            expect(initialProposalValues).toEqual({
                title: '',
                datasets: [],
                researchQuestions: '',
                projectSummary: '',
                impact: '',
                additionalNotes: '',
                piName: '',
            })
        })
    })

    describe('complete validation', () => {
        it('validates complete valid form', () => {
            const result = proposalFormSchema.safeParse(validProposalData)
            expect(result.success).toBe(true)
        })
    })
})
