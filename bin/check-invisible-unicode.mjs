#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { extname } from 'node:path'
import process from 'node:process'
import { TextDecoder } from 'node:util'
import { findInvisibleCharacters, findInvisibleInName } from '../tests/invisible-unicode.mjs'

// Skipped by name, not by content: a NUL byte must not let a text file opt out of the check.
const BINARY_EXTENSIONS = new Set([
    '.gif',
    '.gz',
    '.ico',
    '.jpeg',
    '.jpg',
    '.pdf',
    '.png',
    '.webp',
    '.woff',
    '.woff2',
    '.zip',
])

// fatal: UTF-16 or Latin-1 text would otherwise decode to harmless characters and hide its controls.
// ignoreBOM keeps a leading U+FEFF in the text so that it is reported.
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

// GitHub workflow command property values must escape these characters.
const escapeProperty = (value) =>
    value.replace(/[%\r\n:,]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean)

let found = 0
const report = (message) => {
    found++
    process.stdout.write(`${message}\n`)
}

for (const file of files) {
    const annotation = `::error file=${escapeProperty(file)}`
    // A bidi control in a name can disguise its extension, e.g. `rules<U+202E>dm.png` displays as `rulesgnp.md`.
    for (const codePoint of findInvisibleInName(file)) {
        report(`${annotation}::The file name contains ${codePoint}. Rename the file.`)
    }
    const stats = lstatSync(file, { throwIfNoEntry: false })
    // GitHub shows a symlink's target as its content. Following the link would scan a file that may not be tracked.
    if (stats?.isSymbolicLink()) {
        for (const codePoint of findInvisibleInName(readlinkSync(file))) {
            report(`${annotation}::The symlink target contains ${codePoint}. Change the target.`)
        }
        continue
    }
    // git also lists files deleted but not yet staged, and submodules.
    if (!stats?.isFile() || BINARY_EXTENSIONS.has(extname(file).toLowerCase())) {
        continue
    }
    let text
    try {
        text = utf8.decode(readFileSync(file))
    } catch {
        report(
            `${annotation}::The file is not valid UTF-8, so it cannot be checked for invisible characters. ` +
                'Save it as UTF-8.',
        )
        continue
    }
    for (const { line, column, codePoint } of findInvisibleCharacters(text)) {
        report(
            `${annotation},line=${line},col=${column}::${codePoint} is an invisible or bidirectional control ` +
                'character (Trojan Source, CVE-2021-42574). Delete it. If source code needs it, write it as an ' +
                'escape sequence such as \\u202E.',
        )
    }
}

if (found) {
    process.exitCode = 1
} else {
    process.stdout.write(`No invisible Unicode characters in ${files.length} tracked files\n`)
}
