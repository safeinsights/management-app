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
