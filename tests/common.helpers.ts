import fs from 'fs'
import path from 'path'

export const readTestSupportFile = (file: string) => {
    return fs.promises.readFile(path.join(__dirname, 'support', file), 'utf8')
}

export const IS_CI = !!process.env.CI
