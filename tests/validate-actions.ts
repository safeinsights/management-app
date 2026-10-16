import * as fs from 'fs'
import * as path from 'path'
import { ABILITY_CHECK_EXCEPTIONS, analyzeSource, findStaleExceptions } from './action-file-rules'

const args = process.argv.slice(2)
const VERBOSE = args.includes('--verbose')
const DEFAULT_TARGET = 'src'
const targetDirectory = args.find((arg) => !arg.startsWith('--')) || DEFAULT_TARGET

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    const files = fs.readdirSync(dirPath)
    for (const file of files) {
        const fullPath = path.join(dirPath, file)
        if (fs.statSync(fullPath).isDirectory()) {
            getAllFiles(fullPath, arrayOfFiles)
        } else if (/\.(ts|tsx)$/.test(file)) {
            arrayOfFiles.push(fullPath)
        }
    }
    return arrayOfFiles
}

function repoRelative(file: string) {
    return path.relative(process.cwd(), file).split(path.sep).join('/')
}

function analyzeDirectory(directoryPath: string): void {
    const errorLogs: string[] = []
    const seen: { key: string; guarded: boolean }[] = []

    for (const file of getAllFiles(directoryPath)) {
        const filePath = repoRelative(file)
        const { errors, actions } = analyzeSource(filePath, fs.readFileSync(file, 'utf8'))

        for (const action of actions) seen.push({ key: `${filePath}#${action.name}`, guarded: action.guarded })

        if (errors.length) {
            errorLogs.push(filePath, ...errors.map((error) => `   ✗ ${error}`))
        } else if (VERBOSE && actions.length) {
            // eslint-disable-next-line no-console
            console.log(filePath)
            for (const action of actions) {
                const exception = ABILITY_CHECK_EXCEPTIONS[`${filePath}#${action.name}`]
                // eslint-disable-next-line no-console
                console.log(`   ✓ ${action.name}${exception ? ` (exception, ${exception.kind})` : ''}`)
            }
        }
    }

    // A narrower scan would report every exception outside it as stale.
    if (path.normalize(directoryPath) === DEFAULT_TARGET) {
        const stale = findStaleExceptions(seen)
        if (stale.length) {
            errorLogs.push(
                'tests/action-file-rules.ts',
                ...stale.map(
                    (key) => `   ✗ stale ABILITY_CHECK_EXCEPTIONS entry ${key}: no unguarded action has this key`,
                ),
            )
        }
    }

    if (errorLogs.length) {
        console.error('Analysis failed for some files:')
        errorLogs.forEach((log) => console.error(log))
        process.exit(1)
    }
    // eslint-disable-next-line no-console
    if (VERBOSE) console.log('All files passed analysis.')
}

analyzeDirectory(targetDirectory)
