import * as ts from 'typescript'
import * as fs from 'fs'
import * as path from 'path'

const args = process.argv.slice(2)
const VERBOSE = args.includes('--verbose')
const targetDirectory = args.find((arg) => !arg.startsWith('--')) || 'src'

type ExportStatus = {
    name: string
    wrapper: string | false
}

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

function findServerActionWrapper(node: ts.Expression): string | false {
    let current: ts.Node = node

    while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
        if (ts.isCallExpression(current)) {
            current = current.expression
        } else if (ts.isPropertyAccessExpression(current)) {
            current = current.expression
        }
    }

    if (ts.isNewExpression(current)) {
        const callee = current.expression
        if (ts.isIdentifier(callee) && callee.escapedText === 'Action') {
            if (current.arguments && current.arguments.length > 0) {
                const firstArg = current.arguments[0]
                if (ts.isStringLiteral(firstArg)) {
                    return firstArg.text
                }
            }
            return 'Action'
        }
    }

    return false
}

function checkExportedFunctions(sourceFile: ts.SourceFile): ExportStatus[] {
    const results: ExportStatus[] = []

    function visit(node: ts.Node) {
        if (ts.isFunctionDeclaration(node)) {
            const isExported = node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
            if (isExported) {
                const functionName = node.name ? node.name.getText(sourceFile) : '<anonymous>'
                results.push({ name: functionName, wrapper: false })
            }
        }

        if (ts.isVariableStatement(node)) {
            const isExported = node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
            if (isExported) {
                node.declarationList.declarations.forEach((decl) => {
                    const varName = decl.name.getText(sourceFile)
                    if (decl.initializer) {
                        results.push({ name: varName, wrapper: findServerActionWrapper(decl.initializer) })
                    }
                })
            }
        }

        ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    return results
}

function isProperlyNamed(filePath: string, functionName: string) {
    return functionName.endsWith('Action')
}

function isActionsFile(filePath: string) {
    return filePath.endsWith('actions.ts')
}

const IS_SERVER = /['"]use server['"]/

const IGNORE = new Set(['non-production.tsx', 'layout.tsx', 'page.tsx', 'focused-layout.tsx', 'user-layout.tsx'])
function analyzeFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf8')
    let success = true
    const logs: string[] = []
    const filename = path.basename(filePath)
    if (!IS_SERVER.test(content) || IGNORE.has(filename)) {
        return { success, logs }
    }

    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
    const exportedFunctions = checkExportedFunctions(sourceFile)
    if (exportedFunctions.length > 0) {
        if (VERBOSE) logs.push(filePath)
        let fileHasError = false
        exportedFunctions.forEach((func) => {
            const named = isProperlyNamed(filePath, func.name)
            const wrapped = isActionsFile(filePath) ? func.wrapper : true
            const namesMatch = !wrapped || func.name === func.wrapper
            const isOk = named && wrapped && namesMatch
            if (VERBOSE) logs.push(`   ${isOk ? '✓' : '✗'} ${func.name}`)
            if (!isOk) {
                if (!fileHasError) {
                    logs.unshift(filePath)
                    fileHasError = true
                }
                logs.push(`   ✗ ${func.name}`)
                if (!named) logs.push(`     is not named correctly, should end in 'Action'`)
                if (!wrapped)
                    logs.push(`     is not named wrapped, should be wrapped in one of the access control functions`)
                if (!namesMatch)
                    logs.push(
                        `     action name in constructor ('${func.wrapper}') does not match variable name ('${func.name}')`,
                    )
                success = false
            }
        })
    }

    return { success, logs }
}

function analyzeDirectory(directoryPath: string): void {
    const files = getAllFiles(directoryPath)
    let overallSuccess = true
    const errorLogs: string[] = []

    for (const file of files) {
        const { success, logs } = analyzeFile(file)
        if (!success) {
            overallSuccess = false
            errorLogs.push(...logs)
        } else if (VERBOSE) {
            // eslint-disable-next-line no-console
            logs.forEach((log) => console.log(log))
        }
    }

    if (!overallSuccess) {
        console.error('Analysis failed for some files:')
        errorLogs.forEach((log) => console.error(log))
        process.exit(1)
    } else {
        // eslint-disable-next-line no-console
        if (VERBOSE) console.log('All files passed analysis.')
    }
}

analyzeDirectory(targetDirectory)
