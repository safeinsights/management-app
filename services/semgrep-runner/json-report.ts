import * as fs from 'fs'

export function readJsonReport<T>(jsonPath: string): T | null {
    try {
        return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as T
    } catch {
        return null
    }
}
