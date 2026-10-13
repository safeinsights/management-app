import { describe, it, expect } from '@/tests/unit.helpers'
import { isSensitiveKey, scrubText } from './sentry-scrub-text'

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

describe('scrubText, stack traces', () => {
    it.each([
        'at verify (/app/src/server/auth.ts:12:5)',
        'at load (src/lib/session.ts:40:3)',
        'at render (/app/.next/server/token.mjs:7:1)',
        'at parse (/app/config/secrets.json:2:9)',
    ])('keeps line and column after a source file whose name is a sensitive term: %s', (input) => {
        expect(scrubText(input)).toBe(input)
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

// Each input targets one pattern's worst case. Unbounded or overlapping quantifiers took
// seconds on inputs like these, and scrubText runs synchronously on the server event loop.
const ADVERSARIAL: Array<[string, (size: number) => string]> = [
    ['email: word chars, no @', (size) => 'a'.repeat(size)],
    ['email: dotted local part, no @', (size) => 'a.'.repeat(size / 2)],
    ['email: @ with no dot', (size) => `${'a'.repeat(size / 2)}@${'b'.repeat(size / 2)}`],
    ['email: repeated @', (size) => 'a@'.repeat(size / 2)],
    ['email: repeated %40', (size) => 'a%40'.repeat(size / 4)],
    ['email: many numeric labels', (size) => `a@${'1.'.repeat(size / 2)}`],
    ['email: repeated short addresses without a TLD', (size) => 'a@b.1 '.repeat(size / 6)],
    ['jwt: repeated eyJ', (size) => 'eyJ'.repeat(size / 3)],
    ['jwt: eyJ split by dashes', (size) => '-eyJ'.repeat(size / 4)],
    ['jwt: eyJ split by dots', (size) => '.eyJa'.repeat(size / 5)],
    ['jwt: repeated encoded prefix', (size) => '%3DeyJ'.repeat(size / 6)],
    ['jwt: repeated percent signs', (size) => '%'.repeat(size)],
    ['jwt: two segments only', (size) => `eyJ${'a'.repeat(size / 2)}.${'b'.repeat(size / 2)}`],
    ['bearer: repeated scheme', (size) => 'Bearer '.repeat(size / 7)],
    ['bearer: scheme then whitespace', (size) => `Bearer${' '.repeat(size)}`],
    ['basic: scheme then whitespace', (size) => `Basic${' '.repeat(size)}`],
    ['token: repeated scheme with short values', (size) => `Token ${'a'.repeat(15)} `.repeat(size / 22)],
    ['pair: repeated scheme values', (size) => 'authorization: Basic '.repeat(size / 21)],
    ['pair: long key with no separator', (size) => `?${'a'.repeat(size)}`],
    ['pair: repeated short keys', (size) => '&a'.repeat(size / 2)],
    ['pair: repeated quoted keys', (size) => '"a"'.repeat(size / 3)],
    ['pair: repeated separators', (size) => 'a:'.repeat(size / 2)],
    ['pair: repeated sensitive keys', (size) => 'token:'.repeat(size / 6)],
    ['pair: unterminated quoted value', (size) => `password:"${'a'.repeat(size)}`],
    ['pair: escaped quotes in a value', (size) => `"password":"${'\\"'.repeat(size / 2)}`],
    ['pair: repeated escaped keys', (size) => '\\"token\\":'.repeat(size / 10)],
    ['pair: whitespace runs', (size) => `token${' '.repeat(size)}`],
    ['pair: long bare value', (size) => `token=${'a'.repeat(size)}`],
    ['pair: backslash escapes in a value', (size) => `password:"${'\\a'.repeat(size / 2)}`],
    ['pair: unterminated array value', (size) => `password:[${'a'.repeat(size)}`],
    ['pair: unterminated object value', (size) => `password:{${'a'.repeat(size)}`],
    ['pair: repeated array values', (size) => 'token:['.repeat(size / 7)],
]

describe('scrubText, adversarial input', () => {
    const medianTime = (input: string) => {
        scrubText(input)
        const samples = Array.from({ length: 5 }, () => {
            const start = performance.now()
            for (let i = 0; i < 3; i++) scrubText(input)
            return performance.now() - start
        }).sort((a, b) => a - b)
        return samples[2]
    }
    it.each(ADVERSARIAL)('scales linearly for %s', (_label, makeInput) => {
        const small = medianTime(makeInput(10_000))
        const large = medianTime(makeInput(100_000))
        // A 10x input allows 40x time for noise; a quadratic scan grows about 100x.
        expect(large / Math.max(small, 0.05)).toBeLessThan(40)
    })
})

describe('scrubText, review regressions', () => {
    it.each([
        'accesstoken',
        'authtoken',
        'refreshtoken',
        'clientsecret',
        'userpassword',
        'invite_id',
        'inviteId',
        'dateOfBirth',
        'date_of_birth',
        'socialSecurityNumber',
        'firstName',
        'lastName',
        'otp',
        'verificationCode',
    ])('redacts %s', (key) => {
        expect(isSensitiveKey(key)).toBe(true)
        expect(scrubText(`GET /cb?${key}=opaque-secret&x=1`)).not.toContain('opaque-secret')
    })

    it.each([
        'failed {"credentials":{"primary":{"value":"secret-one"},"backup":"secret-two"}}',
        'failed {"credentials":[["secret-one"],["secret-two"]]}',
        'failed {"credentials":{"value":"secret-one}quoted","backup":"secret-two"}}',
        'failed {"credentials":{"value":"secret-one", "backup":"secret-two"',
    ])('removes the entire structured sensitive value in %s', (input) => {
        const result = scrubText(input)
        expect(result).not.toContain('secret-one')
        expect(result).not.toContain('secret-two')
        expect(result).toContain('[Filtered]')
    })

    it.each([
        '/account/signin?redirect_url=%2Fcb%3Ftoken%3Dopaque-secret',
        'https://x.test/cb?%74oken=opaque-secret',
        '%2Fcb%3Ftoken%3Dopaque-secret',
        '/signin?redirect_url=%2Fcb%3Ftoken%3Dopaque-secret%ZZ',
        '/signin?redirect_url=%2Fsignin%3Fredirect_url%3D%252Fcb%253Faccesstoken%253Dopaque-secret',
    ])('scrubs encoded URL secrets in %s', (input) => {
        expect(scrubText(input)).not.toContain('opaque-secret')
    })

    it('redacts a nested structure with escaped quotes', () => {
        const input = 'failed ' + JSON.stringify({ credentials: { value: 'secret-one"}', backup: 'secret-two' } })
        expect(scrubText(input)).toBe('failed {"credentials":[Filtered]}')
    })

    it('preserves safe query encoding and its leading question mark', () => {
        const query = '?q=hello%20world&redirect_url=%2Fsafe%3Fpage%3D2'
        expect(scrubText(query)).toBe(query)
    })

    it('redacts invitation path credentials', () => {
        expect(scrubText('/account/invitation/00000000-0000-4000-8000-000000000001/signup')).toBe(
            '/account/invitation/[Filtered]/signup',
        )
    })

    it.each(['YTpi', 'dGVzdDoxMjPCow=='])('redacts short or padded Basic credentials %s', (value) => {
        expect(scrubText(`upstream used Basic ${value}`)).toBe('upstream used Basic [Filtered]')
    })

    it.each(['Cookie', 'Set-Cookie'])('removes the whole %s line', (header) => {
        expect(scrubText(`${header}: _ga=1; __session=abcdef; __client_uat=zzz; other_sid=s3cr3t\nnext line`)).toBe(
            `${header}: [Filtered]\nnext line`,
        )
    })

    it('allows only boolean and numeric flag or count values', () => {
        expect(scrubText('tokenCount=3 passwordSet=true')).toBe('tokenCount=3 passwordSet=true')
        expect(scrubText('passwordSet=hunter2')).toBe('passwordSet=[Filtered]')
        expect(scrubText('sessionStorage={resumeCode:"A1B2C3"}')).toBe('sessionStorage=[Filtered]')
    })
})
