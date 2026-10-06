import { describe, it, expect } from '@/tests/unit.helpers'
import { scrubText } from './sentry-scrub-text'

describe('scrubText', () => {
    it('redacts URL-encoded emails', () => {
        expect(scrubText('/invite?identifier=pat%40example.org')).toBe('/invite?identifier=[Filtered]')
    })
})

describe('scrubText, sensitive key/value pairs', () => {
    it.each([
        [
            'JSON',
            '{"password":"hunter2","token":"abc","apiKey":"k","page":2}',
            '{"password":"[Filtered]","token":"[Filtered]","apiKey":"[Filtered]","page":2}',
        ],
        ['spaced JSON with bare values', '{ "secret" : null, "count": 3 }', '{ "secret" : [Filtered], "count": 3 }'],
        [
            'escaped JSON',
            '{\\"password\\":\\"hunter2\\",\\"page\\":2}',
            '{\\"password\\":\\"[Filtered]\\",\\"page\\":2}',
        ],
        ['an escaped quote in the value', '{"password":"a\\"b","page":2}', '{"password":"[Filtered]","page":2}'],
        ['a truncated value', '{"password":"hunt', '{"password":"[Filtered]"'],
        [
            'util.inspect output holding a JSON body',
            `{ route: '/hook', body: '{"password":"hunter2","note":"ok"}' }`,
            `{ route: '/hook', body: '{"password":"[Filtered]","note":"ok"}' }`,
        ],
        ['a quoted util.inspect key', `{ 'api-key': 'k', page: 2 }`, `{ 'api-key': '[Filtered]', page: 2 }`],
        ['key=value in free text', 'retry failed token=abc123 for job', 'retry failed token=[Filtered] for job'],
        ['key=value in brackets', 'failed (session_id=abc)', 'failed (session_id=[Filtered])'],
        ['key: value after another pair', 'msg: token: abc', 'msg: token: [Filtered]'],
        [
            'a URL fragment',
            'https://x.test/cb#access_token=abc123&state=1',
            'https://x.test/cb#access_token=[Filtered]&state=1',
        ],
        ['a dotted key', 'user.token=abc', 'user.token=[Filtered]'],
    ])('redacts the value in %s', (_label, input, expected) => {
        expect(scrubText(input)).toBe(expected)
    })

    it.each([
        '{"url":"https://x.test/a","page":2}',
        'Error: boom at 12:30:00',
        'https://x.test/a/b?page=2&sort=asc',
        'tokenCount=3',
    ])('leaves %s unchanged', (input) => {
        expect(scrubText(input)).toBe(input)
    })
})

describe('scrubText, auth schemes and package versions', () => {
    it.each([
        ['Basic', 'sent Basic YXBpOmtleS0xMjM= upstream', 'sent Basic [Filtered] upstream'],
        ['Token', 'sent Token abc123 upstream', 'sent Token [Filtered] upstream'],
    ])('redacts %s credentials', (_label, input, expected) => {
        expect(scrubText(input)).toBe(expected)
    })

    it.each([
        'at f (/app/node_modules/.pnpm/next@15.3.1_react@19.1.0/node_modules/next/dist/x.js:1:2)',
        'using @sentry/nextjs@10.53.1',
    ])('keeps package@version strings: %s', (input) => {
        expect(scrubText(input)).toBe(input)
    })

    it('still redacts emails with multi-part domains', () => {
        expect(scrubText('mail pat.lee+x@mail.example.co.uk now')).toBe('mail [Filtered] now')
    })
})

const SIZE = 100_000
// Each input targets one pattern's worst case. Unbounded or overlapping quantifiers took
// seconds on inputs like these, and scrubText runs synchronously on the server event loop.
const ADVERSARIAL: Array<[string, string]> = [
    ['email: word chars, no @', 'a'.repeat(SIZE)],
    ['email: dotted local part, no @', 'a.'.repeat(SIZE / 2)],
    ['email: @ with no dot', `${'a'.repeat(SIZE / 2)}@${'b'.repeat(SIZE / 2)}`],
    ['email: repeated @', 'a@'.repeat(SIZE / 2)],
    ['email: repeated %40', 'a%40'.repeat(SIZE / 4)],
    ['email: many numeric labels', `a@${'1.'.repeat(SIZE / 2)}`],
    ['email: repeated short addresses without a TLD', 'a@b.1 '.repeat(SIZE / 6)],
    ['jwt: repeated eyJ', 'eyJ'.repeat(SIZE / 3)],
    ['jwt: eyJ split by dashes', '-eyJ'.repeat(SIZE / 4)],
    ['jwt: eyJ split by dots', '.eyJa'.repeat(SIZE / 5)],
    ['jwt: two segments only', `eyJ${'a'.repeat(SIZE / 2)}.${'b'.repeat(SIZE / 2)}`],
    ['bearer: repeated scheme', 'Bearer '.repeat(SIZE / 7)],
    ['bearer: scheme then whitespace', `Bearer${' '.repeat(SIZE)}`],
    ['pair: long key with no separator', `?${'a'.repeat(SIZE)}`],
    ['pair: repeated short keys', '&a'.repeat(SIZE / 2)],
    ['pair: repeated quoted keys', '"a"'.repeat(SIZE / 3)],
    ['pair: repeated separators', 'a:'.repeat(SIZE / 2)],
    ['pair: repeated sensitive keys', 'token:'.repeat(SIZE / 6)],
    ['pair: unterminated quoted value', `password:"${'a'.repeat(SIZE)}`],
    ['pair: escaped quotes in a value', `"password":"${'\\"'.repeat(SIZE / 2)}`],
    ['pair: repeated escaped keys', '\\"token\\":'.repeat(SIZE / 10)],
    ['pair: whitespace runs', `token${' '.repeat(SIZE)}`],
]

describe('scrubText, adversarial input', () => {
    it.each(ADVERSARIAL)('scrubs 100KB of %s in linear time', (_label, input) => {
        const start = performance.now()
        scrubText(input)
        expect(performance.now() - start).toBeLessThan(200)
    })
})
