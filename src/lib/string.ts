export function strToAscii(str: string) {
    return str.replace(/[^a-zA-Z0-9]/g, '')
}

// https://dense13.com/blog/2009/05/03/converting-string-to-slug-javascript/
export function slugify(str: string) {
    str = str.replace(/^\s+|\s+$/g, '') // trim
    str = str.toLowerCase()

    // remove accents, swap ñ for n, etc
    const from = 'àáäâèéëêìíïîòóöôùúüûñç·/_,:;'
    const to = 'aaaaeeeeiiiioooouuuunc------'
    for (let i = 0, l = from.length; i < l; i++) {
        str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i))
    }

    str = str
        .replace(/[^a-z0-9 -]/g, '') // remove invalid chars
        .replace(/\s+/g, '-') // collapse whitespace and replace by -
        .replace(/-+/g, '-') // collapse dashes

    return str.slice(0, 50)
}

export function randomString(length: number) {
    // without ambiguous characters i, l, 1, o, O, and 0
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
        .replace(/\*\*/g, '') // remove asterisks
        .replace(/_/g, ' ') // replace underscores with spaces
        .replace(/\b\w/g, (char) => char.toUpperCase()) // capitalize first letter of each word
}

export function titleize(str: string) {
    if (!str) {
        return ''
    }
    return str.toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase())
}

// Returns only the initials or the initials with the icon type suffix
export function orgInitials(orgName: string, type: string, initialsOnly: boolean = false) {
    if (!orgName || !type) {
        return ''
    }

    // Remove whitespace and take up to first 3 characters
    const compact = orgName.replace(/\s+/g, '')
    const firstThree = compact.substring(0, Math.min(3, compact.length)).toUpperCase()

    if (initialsOnly) {
        return firstThree
    }

    return firstThree + (type === 'enclave' ? '-D' : '-L')
}

// Returns the initials with the title text type suffix
export function orgInitialsTitle(orgName: string, type: string) {
    if (!orgName || !type) {
        return ''
    }

    const compact = orgName.replace(/\s+/g, '')
    const firstThree = compact.substring(0, Math.min(3, compact.length)).toUpperCase()

    return firstThree + (type === 'enclave' ? '-Data Org' : '-Research Lab')
}
