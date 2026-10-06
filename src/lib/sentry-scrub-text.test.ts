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

describe('scrubText, long and structured values', () => {
    it('redacts every char of a long bare value', () => {
        const token = 'A'.repeat(2000)
        const result = scrubText(`https://s3.test/f?X-Amz-Security-Token=${token}&X-Amz-Date=1`)

        expect(result).toBe('https://s3.test/f?X-Amz-Security-Token=[Filtered]&X-Amz-Date=1')
    })

    it('redacts every char of a long quoted value', () => {
        const secret = 'x'.repeat(5000)

        expect(scrubText(`{"password":"${secret}","page":2}`)).toBe('{"password":"[Filtered]","page":2}')
    })

    it.each([
        ['an array', '{"tokens":["aaa","bbb"],"page":2', '{"tokens":[Filtered],"page":2'],
        ['an object', '{"password":{"v":"secret1"}', '{"password":[Filtered]'],
    ])('redacts %s under a sensitive key in truncated JSON', (_label, input, expected) => {
        expect(scrubText(input)).toBe(expected)
    })
})

describe('scrubText, JWTs after URL-encoded chars', () => {
    const jwt = 'eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl'

    it.each([
        [
            '%3D',
            `redirect_url=https%3A%2F%2Fapp.test%2Fx%3Fv%3D${jwt}&page=2`,
            'redirect_url=https%3A%2F%2Fapp.test%2Fx%3Fv%3D[Filtered]&page=2',
        ],
        ['%22', `state=%22${jwt}%22`, 'state=%22[Filtered]%22'],
    ])('redacts a JWT after %s', (_label, input, expected) => {
        expect(scrubText(input)).toBe(expected)
    })
})

describe('scrubText, auth schemes and package versions', () => {
    it.each([
        ['Basic', 'sent Basic dXNlcm5hbWU6cGFzc3dvcmQ= upstream', 'sent Basic [Filtered] upstream'],
        ['Token', 'sent Token abc123def456ghi789 upstream', 'sent Token [Filtered] upstream'],
        ['short Basic after an Authorization key', 'Authorization: Basic YTpi', 'Authorization: [Filtered]'],
        ['lower-case basic after an authorization key', 'authorization: basic YTpi', 'authorization: [Filtered]'],
    ])('redacts %s credentials', (_label, input, expected) => {
        expect(scrubText(input)).toBe(expected)
    })

    it.each(['upgraded to basic plan; token expired; Invalid token for user', 'Invalid Token\n    at verify'])(
        'keeps prose that only mentions a scheme: %s',
        (input) => {
            expect(scrubText(input)).toBe(input)
        },
    )

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
    ['jwt: repeated encoded prefix', '%3DeyJ'.repeat(SIZE / 6)],
    ['jwt: repeated percent signs', '%'.repeat(SIZE)],
    ['jwt: two segments only', `eyJ${'a'.repeat(SIZE / 2)}.${'b'.repeat(SIZE / 2)}`],
    ['bearer: repeated scheme', 'Bearer '.repeat(SIZE / 7)],
    ['bearer: scheme then whitespace', `Bearer${' '.repeat(SIZE)}`],
    ['basic: scheme then whitespace', `Basic${' '.repeat(SIZE)}`],
    ['token: repeated scheme with short values', `Token ${'a'.repeat(15)} `.repeat(SIZE / 22)],
    ['pair: repeated scheme values', 'authorization: Basic '.repeat(SIZE / 21)],
    ['pair: long key with no separator', `?${'a'.repeat(SIZE)}`],
    ['pair: repeated short keys', '&a'.repeat(SIZE / 2)],
    ['pair: repeated quoted keys', '"a"'.repeat(SIZE / 3)],
    ['pair: repeated separators', 'a:'.repeat(SIZE / 2)],
    ['pair: repeated sensitive keys', 'token:'.repeat(SIZE / 6)],
    ['pair: unterminated quoted value', `password:"${'a'.repeat(SIZE)}`],
    ['pair: escaped quotes in a value', `"password":"${'\\"'.repeat(SIZE / 2)}`],
    ['pair: repeated escaped keys', '\\"token\\":'.repeat(SIZE / 10)],
    ['pair: whitespace runs', `token${' '.repeat(SIZE)}`],
    ['pair: long bare value', `token=${'a'.repeat(SIZE)}`],
    ['pair: backslash escapes in a value', `password:"${'\\a'.repeat(SIZE / 2)}`],
    ['pair: unterminated array value', `password:[${'a'.repeat(SIZE)}`],
    ['pair: unterminated object value', `password:{${'a'.repeat(SIZE)}`],
    ['pair: repeated array values', 'token:['.repeat(SIZE / 7)],
]

describe('scrubText, adversarial input', () => {
    it.each(ADVERSARIAL)('scrubs 100KB of %s in linear time', (_label, input) => {
        const start = performance.now()
        scrubText(input)
        expect(performance.now() - start).toBeLessThan(200)
    })
})
