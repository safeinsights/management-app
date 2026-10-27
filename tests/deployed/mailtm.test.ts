import { describe, expect, it } from 'vitest'
import { extractSignupUrl, randomToken, type Message } from './mailtm'

const message = (overrides: Partial<Message>): Message => ({
    id: 'm1',
    subject: '',
    from: '',
    text: '',
    html: '',
    ...overrides,
})

describe('extractSignupUrl', () => {
    it('finds the invitation link in the text body', () => {
        const url = 'https://app.qa.safeinsights.org/account/invitation/0191c3a0-7f2e-7d6e-9c3b-2b0a3f3b1c2d'
        expect(extractSignupUrl(message({ text: `You were invited. Accept here: ${url}.` }))).toBe(url)
    })

    it('decodes entities in an html href and ignores the footer links', () => {
        const html = [
            '<a href="https://app.qa.safeinsights.org/about">About</a>',
            '<a href="https://app.qa.safeinsights.org/account/invitation/abc?utm_source=mail&amp;utm_medium=email">Accept</a>',
        ].join('\n')
        expect(extractSignupUrl(message({ html }))).toBe(
            'https://app.qa.safeinsights.org/account/invitation/abc?utm_source=mail&utm_medium=email',
        )
    })

    it('throws when no invitation link is present', () => {
        expect(() => extractSignupUrl(message({ text: 'see https://example.com/' }))).toThrow(/no invitation url/)
    })
})

describe('randomToken', () => {
    it('is the requested length from the lowercase alphanumeric alphabet', () => {
        for (const length of [1, 10, 33]) {
            expect(randomToken(length)).toMatch(new RegExp(`^[a-z0-9]{${length}}$`))
        }
    })
})
