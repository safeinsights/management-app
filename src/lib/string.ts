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

export function randomString(length: number) {
    // omits ambiguous characters i, l, 1, o, O, 0
    const charset = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let retVal = ''
    for (let i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n))
    }
    return retVal
}

export function truncate(text: string) {
    if (text.length > 20) {
        return text.substring(0, 20) + '...'
    }
    return text
}

export function formatClerkErrorCode(str: string) {
    return str
        .replace(/\*\*/g, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function titleize(str: string) {
    if (!str) {
        return ''
    }
    return str.toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase())
}

const ORG_SUFFIX_SHORT: Record<string, string> = {
    enclave: '-D',
    lab: '-L',
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

export function orgInitials(orgName: string, type: string, initialsOnly: boolean = false) {
    if (!orgName || !type) return ''

    const firstThree = orgFirstThree(orgName)
    if (initialsOnly) return firstThree

    return firstThree + ORG_SUFFIX_SHORT[type]
}

export function orgInitialsTitle(orgName: string, type: string) {
    if (!orgName || !type) return ''

    const firstThree = orgFirstThree(orgName)
    return firstThree + ORG_SUFFIX_LONG[type]
}

export function getInitials(fullName: string): string {
    const words = fullName.trim().split(/\s+/)
    if (words.length === 0 || words[0] === '') return ''
    if (words.length === 1) return words[0][0].toUpperCase()
    return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export function displayOrgName(orgName: string): string {
    if (!orgName) return ''
    return orgName
        .replace(/\bLab\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
}

// A slug is not a name: displayOrgName strips the word "Lab", and a hyphen is a word boundary, so
// "genius-lab" would come back as "genius-". Only a real name goes through it.
export function displayLabName(labName: string | null | undefined, fallbackSlug: string): string {
    return labName ? displayOrgName(labName) : fallbackSlug
}

export function toSentence(items: string[], conjunction: string = 'and'): string {
    if (items.length === 0) return ''
    if (items.length === 1) return items[0]
    if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`
    return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`
}

export function stringifyJson(value: Json | null | undefined): string | null {
    if (value == null) return null
    return typeof value === 'string' ? value : JSON.stringify(value)
}
