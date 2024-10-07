import 'server-only'


// https://developer.grubhub.com/docs/6B3UztsSoYRxHZ0FwS5cfV/uuid-encoding

export function b64toUUID(str: string) {
    let urlUnsafe = str.replace(/-/g, '+').replace(/_/g, '/')
    let arr = atob(urlUnsafe)
        .split('')
        .map((c) => {
            let char = c.charCodeAt(0)
            return ('0' + char.toString(16)).substr(-2, 2)
        })
    arr.splice(4, 0, '-')
    arr.splice(7, 0, '-')
    arr.splice(10, 0, '-')
    arr.splice(13, 0, '-')
    return arr.join('').toLowerCase()
}

export function uuidToB64(str: string) {
    const cleaned = str
        .replace(/-/g, '')
        .match(/\w{2}/g)
        ?.map((a) => {
            return String.fromCharCode(parseInt(a, 16))
        })
        ?.join('')

    if (!cleaned) {
        throw new Error('Invalid UUID')
    }

    return btoa(cleaned).replace(/=*$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}
