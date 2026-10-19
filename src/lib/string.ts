import { Json } from '@/database/types'

export function strToAscii(str: string) {
    return str.replace(/[^a-zA-Z0-9]/g, '')
}

// Makes a user-supplied filename safe as one token in a POSIX `/bin/sh` command line.
export function shellQuote(value: string): string {
    // Close the quote, emit an escaped single quote, reopen: ' -> '\''
    const escaped = value.split("'").join("'\\''")
    return `'${escaped}'`
}

// A quote pair hugging the token is absorbed so an admin-quoted template doesn't double-quote
// on top of our own quoting (OTTER-477).
export function substituteEntryPointFile(template: string, fileName: string): string {
    // The function form keeps `$` in the filename from being read as a replacement pattern.
    return template.replace(/(['"]?)%f\1/g, () => shellQuote(fileName))
}

// https://dense13.com/blog/2009/05/03/converting-string-to-slug-javascript/
export function slugify(str: string) {
    str = str.replace(/^\s+|\s+$/g, '')
    str = str.toLowerCase()

    const from = 'àáäâèéëêìíïîòóöôùúüûñç·/_,:;'
    const to = 'aaaaeeeeiiiioooouuuunc------'
    for (let i = 0, l = from.length; i < l; i++) {
        str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i))
    }

    str = str
        .replace(/[^a-z0-9 -]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')

    return str.slice(0, 50)
}

export function truncate(text: string) {
    if (text.length > 20) {
        return text.substring(0, 20) + '...'
    }
    return text
}

export function titleize(str: string) {
    if (!str) {
        return ''
    }
    return str.toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase())
}

const ORG_SUFFIX_LONG: Record<string, string> = {
    enclave: ' Data Partner',
    lab: '-Research Lab',
}

function orgFirstThree(orgName: string): string {
    if (!orgName) return ''
    const compact = orgName.replace(/\s+/g, '')
    return compact.substring(0, Math.min(3, compact.length)).toUpperCase()
}

export function orgInitialsTitle(orgName: string, type: string) {
    if (!orgName || !type) return ''

    const firstThree = orgFirstThree(orgName)
    return firstThree + ORG_SUFFIX_LONG[type]
}

// From the name fields, not a split full name: a multi-word surname gives its first letter ("Van Dyke"
// -> V). Array.from keeps a character outside the BMP (𠮷) whole.
export const initialsFromNames = (firstName?: string | null, lastName?: string | null) =>
    [firstName, lastName]
        .map((name) => Array.from(name?.trim() ?? '')[0] ?? '')
        .join('')
        .toUpperCase()

// A study reaches its own page before it has a title, both while it is being set up and once it is
// saved with the field left empty, so both places head it with these words.
export const UNTITLED_STUDY_TITLE = 'Untitled study'

export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
    return `${count} ${count === 1 ? noun : pluralNoun}`
}

export function stringifyJson(value: Json | null | undefined): string | null {
    if (value == null) return null
    return typeof value === 'string' ? value : JSON.stringify(value)
}
