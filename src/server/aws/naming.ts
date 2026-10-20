const safeDbNameRegex = /^[a-z0-9_]+$/

export const toDbName = (orgSlug: string, identifier: string) => {
    const name = `${orgSlug}_${identifier}`.replace(/-/g, '_')
    if (!safeDbNameRegex.test(name)) {
        throw new Error(`Invalid database name: ${name}`)
    }
    return name
}

export const toAthenaDbName = toDbName
export const toPgDbName = toDbName

export function sanitizeColumnName(raw: string): string {
    let name = raw
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
    if (!name || /^\d/.test(name)) name = `col_${name}`
    return name
}
