import { describe, it, expect } from 'vitest'
import {
    CHARACTER_LIMITS,
    DRAFT_REQUIRED_ERRORS,
    draftProposalFormSchema,
    FIELD_TITLES,
    proposalFormSchema,
    initialProposalValues,
} from './schema'
import { STUDY_TITLE_MAX_CHARACTERS, STUDY_TITLE_OVER_LIMIT_ERROR } from '@/app/[orgSlug]/study/request/form-schemas'
import { overCharacterLimitError } from '@/lib/field-limits'
import { BLANK_UUID } from '@/tests/unit.helpers'

function lexicalText(text: string): string {
    return JSON.stringify({ root: { type: 'text', text } })
}

function words(count: number): string {
    return Array(count).fill('word').join(' ')
}

const validProposalData = {
    title: 'Valid Study Title',
    datasets: ['dataset-1'],
    researchQuestions: lexicalText('What is the primary research question?'),
    projectSummary: lexicalText('This study examines the relationship between variables.'),
    impact: lexicalText('Findings will inform educational practice.'),
    additionalNotes: '',
    piName: 'Jane Smith',
    piUserId: BLANK_UUID,
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

        // trim() runs before min(1), so a whitespace-only title fails here rather than passing
        // schema validation while a separate trimmed check quietly disables submit.
        it('rejects a whitespace-only title', () => {
            const result = proposalFormSchema.safeParse({ ...validProposalData, title: '   ' })

            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.issues.find((e) => e.path.includes('title'))?.message).toBe(
                    'This field is required.',
                )
            }
        })

        it('rejects title exceeding the character limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                title: 'x'.repeat(STUDY_TITLE_MAX_CHARACTERS + 1),
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                const error = result.error.issues.find((e) => e.path.includes('title'))
                expect(error?.message).toBe(STUDY_TITLE_OVER_LIMIT_ERROR)
            }
        })

        it('accepts title at exactly the character limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                title: 'x'.repeat(STUDY_TITLE_MAX_CHARACTERS),
            })
            expect(result.success).toBe(true)
        })

        // Characters, not words: 30 short words is past the old 20-word cap and inside 60
        // characters, so this fails if the word rule survived.
        it('measures the title in characters rather than words', () => {
            const result = proposalFormSchema.safeParse({ ...validProposalData, title: 'ab '.repeat(20).trim() })
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

        it('rejects content exceeding the character limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                researchQuestions: lexicalText('x'.repeat(CHARACTER_LIMITS.researchQuestions + 1)),
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                const error = result.error.issues.find((e) => e.path.includes('researchQuestions'))
                expect(error?.message).toBe(
                    overCharacterLimitError(FIELD_TITLES.researchQuestions, CHARACTER_LIMITS.researchQuestions),
                )
            }
        })

        it('accepts content at exactly the character limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                researchQuestions: lexicalText('x'.repeat(CHARACTER_LIMITS.researchQuestions)),
            })
            expect(result.success).toBe(true)
        })

        it('counts formatted runs as one continuous string', () => {
            const formattedJson = JSON.stringify({
                root: {
                    type: 'root',
                    children: [
                        {
                            type: 'paragraph',
                            children: [
                                { type: 'text', text: 'un' },
                                { type: 'text', text: 'formatted', format: 1 },
                                { type: 'text', text: ' question' },
                            ],
                        },
                    ],
                },
            })
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                researchQuestions: formattedJson,
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

        it('rejects content exceeding the character limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                projectSummary: lexicalText('x'.repeat(CHARACTER_LIMITS.projectSummary + 1)),
            })

            expect(result.success).toBe(false)
        })

        it('accepts content at the character limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                projectSummary: lexicalText('x'.repeat(CHARACTER_LIMITS.projectSummary)),
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

        it('rejects content exceeding the character limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                impact: lexicalText('x'.repeat(CHARACTER_LIMITS.impact + 1)),
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

        it('rejects content exceeding the character limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                additionalNotes: lexicalText('x'.repeat(CHARACTER_LIMITS.additionalNotes + 1)),
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                const error = result.error.issues.find((e) => e.path.includes('additionalNotes'))
                expect(error?.message).toBe(
                    overCharacterLimitError(FIELD_TITLES.additionalNotes, CHARACTER_LIMITS.additionalNotes),
                )
            }
        })

        it('accepts content at the character limit', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                additionalNotes: lexicalText('x'.repeat(CHARACTER_LIMITS.additionalNotes)),
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

        // A name with no linked user must fail, and the issue has to land on `piName` rather than
        // `piUserId`: no field renders the id, so an error there blocks submit with nothing the
        // user can see or clear. `piName` is the path the Select displays.
        it('rejects a piName whose piUserId is empty, reporting it on the piName path', () => {
            const result = proposalFormSchema.safeParse({ ...validProposalData, piUserId: '' })

            expect(result.success).toBe(false)
            if (!result.success) {
                const issue = result.error.issues.find((e) => e.path.includes('piName'))
                expect(issue?.message).toBe('Select a Principal Investigator from the list.')
                expect(result.error.issues.some((e) => e.path.includes('piUserId'))).toBe(false)
            }
        })

        it('rejects a piName whose piUserId is not a uuid', () => {
            const result = proposalFormSchema.safeParse({ ...validProposalData, piUserId: 'not-a-uuid' })

            expect(result.success).toBe(false)
            if (!result.success) {
                const issue = result.error.issues.find((e) => e.path.includes('piName'))
                expect(issue?.message).toBe('Select a Principal Investigator from the list.')
            }
        })

        it('absorbs an omitted piUserId rather than throwing on undefined', () => {
            const { piUserId: _omitted, ...withoutId } = validProposalData
            const result = proposalFormSchema.safeParse(withoutId)

            // Hydrating a draft with no PI yields undefined; `.default('')` absorbs it so the
            // failure is the visible cross-field message, not a type error on a hidden path.
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.issues.find((e) => e.path.includes('piName'))?.message).toBe(
                    'Select a Principal Investigator from the list.',
                )
            }
        })
    })

    describe('datasets', () => {
        it('rejects empty array', () => {
            const result = proposalFormSchema.safeParse({
                ...validProposalData,
                datasets: [],
            })
            expect(result.success).toBe(false)
            if (!result.success) {
                const error = result.error.issues.find((e) => e.path.includes('datasets'))
                expect(error?.message).toBe('Select at least one dataset.')
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
                piUserId: '',
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

const messagesFor = (result: ReturnType<typeof draftProposalFormSchema.safeParse>, path: string) =>
    result.success ? [] : result.error.issues.filter((i) => i.path[0] === path).map((i) => i.message)

// Step 2 on a DRAFT. Everything here is deliberately absent from `proposalFormSchema`, which the
// CHANGE-REQUESTED resubmit page still uses.
describe('draftProposalFormSchema (OTTER-691)', () => {
    // The title lives on Step 1 now, so this schema must not carry a rule for a field the page
    // does not render: that is a submit blocker the user cannot clear (OTTER-647).
    it('accepts a payload with no title at all', () => {
        const { title: _title, ...withoutTitle } = validProposalData
        expect(draftProposalFormSchema.safeParse(withoutTitle).success).toBe(true)
    })

    describe('empty-field messages', () => {
        it('names the dataset field', () => {
            const result = draftProposalFormSchema.safeParse({ ...validProposalData, datasets: [] })
            expect(messagesFor(result, 'datasets')).toContain(DRAFT_REQUIRED_ERRORS.datasets)
        })

        it('names each empty rich-text field', () => {
            const result = draftProposalFormSchema.safeParse({
                ...validProposalData,
                researchQuestions: lexicalText('   '),
                projectSummary: lexicalText(''),
                impact: lexicalText(''),
            })
            expect(messagesFor(result, 'researchQuestions')).toContain(DRAFT_REQUIRED_ERRORS.researchQuestions)
            expect(messagesFor(result, 'projectSummary')).toContain(DRAFT_REQUIRED_ERRORS.projectSummary)
            expect(messagesFor(result, 'impact')).toContain(DRAFT_REQUIRED_ERRORS.impact)
        })

        it('names the Principal Investigator field', () => {
            const result = draftProposalFormSchema.safeParse({ ...validProposalData, piName: '' })
            expect(messagesFor(result, 'piName')).toContain(DRAFT_REQUIRED_ERRORS.piName)
        })

        // One control, one message: a blank field is empty, not also over-limit.
        it('reports only the empty message for a blank field', () => {
            const result = draftProposalFormSchema.safeParse({ ...validProposalData, impact: lexicalText('') })
            expect(messagesFor(result, 'impact')).toEqual([DRAFT_REQUIRED_ERRORS.impact])
        })
    })

    describe('character limits', () => {
        // Pinned to literals, not to CHARACTER_LIMITS. Every other assertion in this block derives
        // its expectation from the constant, so a typo in the constant would move the test with it
        // and the four numbers the card specifies would go unguarded.
        it('caps each field at the number the card specifies', () => {
            expect(CHARACTER_LIMITS).toEqual({
                researchQuestions: 3000,
                projectSummary: 6000,
                impact: 3000,
                additionalNotes: 1800,
            })
        })

        it.each([
            ['researchQuestions', 3000],
            ['projectSummary', 6000],
            ['impact', 3000],
            ['additionalNotes', 1800],
        ] as const)('accepts %s at %i characters and rejects one more', (field, limit) => {
            expect(
                draftProposalFormSchema.safeParse({ ...validProposalData, [field]: lexicalText('x'.repeat(limit)) })
                    .success,
            ).toBe(true)

            const tooLong = draftProposalFormSchema.safeParse({
                ...validProposalData,
                [field]: lexicalText('x'.repeat(limit + 1)),
            })
            expect(messagesFor(tooLong, field)).toContain(
                `${FIELD_TITLES[field]} exceeds the ${limit} limit. Shorten it to continue.`,
            )
        })

        it('accepts a field exactly at its limit', () => {
            const result = draftProposalFormSchema.safeParse({
                ...validProposalData,
                impact: lexicalText('x'.repeat(CHARACTER_LIMITS.impact)),
            })
            expect(result.success).toBe(true)
        })

        it('rejects one character past the limit, naming the field and the cap', () => {
            const result = draftProposalFormSchema.safeParse({
                ...validProposalData,
                impact: lexicalText('x'.repeat(CHARACTER_LIMITS.impact + 1)),
            })
            expect(messagesFor(result, 'impact')).toContain(
                `${FIELD_TITLES.impact} exceeds the ${CHARACTER_LIMITS.impact} limit. Shorten it to continue.`,
            )
        })

        // Characters, not words: 3000 short words is far past a 500-word cap but well inside the
        // character cap, so this fails if word counting survived anywhere.
        it('measures characters rather than words', () => {
            const result = draftProposalFormSchema.safeParse({
                ...validProposalData,
                impact: lexicalText(words(600)),
            })
            expect(result.success).toBe(true)
        })

        // The card excludes whitespace at either end of the content from the count, and counts
        // everything between, so "a b" is three characters.
        it('excludes surrounding whitespace from the cap and counts interior whitespace', () => {
            const padded = draftProposalFormSchema.safeParse({
                ...validProposalData,
                impact: lexicalText(`  ${'x'.repeat(CHARACTER_LIMITS.impact)}  `),
            })
            expect(padded.success).toBe(true)

            const spaced = `${'x'.repeat(CHARACTER_LIMITS.impact / 2)} ${'y'.repeat(CHARACTER_LIMITS.impact / 2)}`
            expect(spaced).toHaveLength(CHARACTER_LIMITS.impact + 1)
            const overBySpace = draftProposalFormSchema.safeParse({ ...validProposalData, impact: lexicalText(spaced) })
            expect(messagesFor(overBySpace, 'impact')).toContain(
                `${FIELD_TITLES.impact} exceeds the ${CHARACTER_LIMITS.impact} limit. Shorten it to continue.`,
            )
        })

        it('caps the optional notes field without requiring it', () => {
            expect(draftProposalFormSchema.safeParse({ ...validProposalData, additionalNotes: '' }).success).toBe(true)

            const tooLong = draftProposalFormSchema.safeParse({
                ...validProposalData,
                additionalNotes: lexicalText('x'.repeat(CHARACTER_LIMITS.additionalNotes + 1)),
            })
            expect(messagesFor(tooLong, 'additionalNotes')).toContain(
                `${FIELD_TITLES.additionalNotes} exceeds the ${CHARACTER_LIMITS.additionalNotes} limit. Shorten it to continue.`,
            )
        })
    })
})

// The resubmit page shares this module and now measures the same fields in the same unit as Step 2
// (OTTER-737). Only the empty-field wording still differs between the two.
describe('proposalFormSchema counts characters (OTTER-737)', () => {
    it('accepts a field over the old 500-word cap that is inside the character limit', () => {
        const result = proposalFormSchema.safeParse({
            ...validProposalData,
            impact: lexicalText(words(600)),
        })
        expect(result.success).toBe(true)
    })

    it('caps each field at the same value the DRAFT resolver uses', () => {
        const result = proposalFormSchema.safeParse({
            ...validProposalData,
            impact: lexicalText('x'.repeat(CHARACTER_LIMITS.impact + 1)),
        })
        const messages = result.success ? [] : result.error.issues.map((i) => i.message)
        expect(messages).toContain(overCharacterLimitError(FIELD_TITLES.impact, CHARACTER_LIMITS.impact))
    })

    it('keeps its generic required message rather than the Step 2 wording', () => {
        const result = proposalFormSchema.safeParse({ ...validProposalData, datasets: [] })
        const messages = result.success ? [] : result.error.issues.map((i) => i.message)
        expect(messages).not.toContain(DRAFT_REQUIRED_ERRORS.datasets)
    })
})
