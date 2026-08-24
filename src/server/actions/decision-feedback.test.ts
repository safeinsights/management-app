import { describe, expect, it } from 'vitest'
import { lexicalJson } from '@/lib/lexical'
import { overCharacterLimitError } from '@/lib/field-limits'
import type { ActionFailure } from '@/lib/errors'
import { assertDecisionFeedback } from './decision-feedback'

const OPTIONS = { fieldTitle: 'Decision', maxCharacters: 1800 }

const failureFrom = (feedback: string, options = OPTIONS) => {
    try {
        assertDecisionFeedback(feedback, options)
    } catch (error) {
        return (error as ActionFailure).error
    }
    return undefined
}

describe('assertDecisionFeedback', () => {
    it('returns the normalized Lexical JSON for plain text', () => {
        const json = assertDecisionFeedback('This request is feasible.', OPTIONS)

        expect(JSON.parse(json).root).toBeDefined()
        expect(json).toBe(lexicalJson('This request is feasible.'))
    })

    it('passes Lexical JSON through unchanged', () => {
        const already = lexicalJson('Already a Lexical state.')

        expect(assertDecisionFeedback(already, OPTIONS)).toBe(already)
    })

    it('rejects an empty or whitespace-only decision', () => {
        expect(failureFrom('')).toEqual({ feedback: 'Feedback is required' })
        expect(failureFrom('   ')).toEqual({ feedback: 'Feedback is required' })
        expect(failureFrom(lexicalJson('  \n\t '))).toEqual({ feedback: 'Feedback is required' })
    })

    it('accepts exactly the cap and rejects one character past it', () => {
        expect(() => assertDecisionFeedback('x'.repeat(1800), OPTIONS)).not.toThrow()
        expect(failureFrom('x'.repeat(1801))).toEqual({ feedback: overCharacterLimitError('Decision', 1800) })
    })

    it('excludes whitespace at either end from the cap', () => {
        expect(() => assertDecisionFeedback(`  ${'x'.repeat(1800)}  `, OPTIONS)).not.toThrow()
    })

    // The three review steps pass their own constants, so the message names the caller's field.
    it('names the field and cap it was given', () => {
        const failure = failureFrom('x'.repeat(11), { fieldTitle: 'Something else', maxCharacters: 10 })

        expect(failure).toEqual({ feedback: overCharacterLimitError('Something else', 10) })
    })
})
