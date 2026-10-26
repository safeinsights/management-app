#!/usr/bin/env node
// Usage: node bin/check-invisible-unicode.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import process from 'node:process'
import { findInvisibleCharacters } from '../tests/invisible-unicode.mjs'

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

// GitHub workflow command property values must escape these characters.
const escapeProperty = (value) =>
    value.replace(/[%\r\n:,]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean)

let found = 0
for (const file of files) {
    // git also lists files deleted but not yet staged, submodules, and symlinks to folders.
    if (!statSync(file, { throwIfNoEntry: false })?.isFile() || BINARY_EXTENSIONS.has(extname(file).toLowerCase())) {
        continue
    }
    for (const { line, column, codePoint } of findInvisibleCharacters(readFileSync(file, 'utf8'))) {
        found++
        process.stdout.write(
            `::error file=${escapeProperty(file)},line=${line},col=${column}::${codePoint} is an invisible or ` +
                'bidirectional control character (Trojan Source, CVE-2021-42574). Delete it. If source code needs ' +
                'it, write it as an escape sequence such as \\u202E.\n',
        )
    }
}

if (found) {
    process.exitCode = 1
} else {
    process.stdout.write(`No invisible Unicode characters in ${files.length} tracked files\n`)
}
