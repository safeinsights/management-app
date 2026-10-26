#!/usr/bin/env node
// Usage: node bin/check-invisible-unicode.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { findInvisibleCharacters } from '../tests/invisible-unicode.mjs'

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean)

let found = 0
for (const file of files) {
    // A file deleted locally but not yet staged is still listed.
    if (!existsSync(file)) continue
    const bytes = readFileSync(file)
    // Same rule as `git grep -I`: a NUL byte marks a binary file.
    if (bytes.includes(0)) continue
    for (const { line, column, codePoint } of findInvisibleCharacters(bytes.toString('utf8'))) {
        found++
        process.stdout.write(
            `::error file=${file},line=${line},col=${column}::${codePoint} is an invisible or bidirectional control ` +
                'character (Trojan Source, CVE-2021-42574). Delete it, or write it as an escape sequence such as \\u202E.\n',
        )
    }
}

if (found) {
    process.exitCode = 1
} else {
    process.stdout.write(`No invisible Unicode characters in ${files.length} tracked files\n`)
}
