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

/**
 * Recursively retrieves all files with .ts or .tsx extensions in the given directory.
 */
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

/**
 * Checks if a given expression node is a CallExpression that wraps a function
 * using `serverAction`.
 */
function findServerActionWrapper(node: ts.Expression): string | false {
    let current: ts.Node = node

    // Traverse down the chain of CallExpressions and PropertyAccessExpressions
    while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
        if (ts.isCallExpression(current)) {
            current = current.expression
        } else if (ts.isPropertyAccessExpression(current)) {
            current = current.expression
        }
    }

    // Check if we ended up at `new Action(...)`
    if (ts.isNewExpression(current)) {
        const callee = current.expression
        if (ts.isIdentifier(callee) && callee.escapedText === 'Action') {
            if (current.arguments && current.arguments.length > 0) {
                const firstArg = current.arguments[0]
                if (ts.isStringLiteral(firstArg)) {
                    return firstArg.text // This will be the action name string
                }
            }
            return 'Action' // Or maybe something to indicate name not found
        }
    }

    return false
}

/**
 * Traverses the AST to find all exported functions.
 * It handles both function declarations and exported variable statements.
 * For variable declarations, it checks whether the initializer is a serverAction call.
 */
function checkExportedFunctions(sourceFile: ts.SourceFile): ExportStatus[] {
    const results: ExportStatus[] = []

    function visit(node: ts.Node) {
        // Check for exported function declarations:
        if (ts.isFunctionDeclaration(node)) {
            const isExported = node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
            if (isExported) {
                const functionName = node.name ? node.name.getText(sourceFile) : '<anonymous>'
                // Function declarations are not wrapped (unless they’re assigned later)
                results.push({ name: functionName, wrapper: false })
            }
        }

        // Check for exported variables that might hold function expressions or arrow functions:
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
/**
 * Analyzes a single file: checks if it contains the "use server" directive,
 * then parses its AST to check for exported functions and if they are wrapped.
 */
function analyzeFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf8')
    let success = true
    const logs: string[] = []

    if (!IS_SERVER.test(content) || filePath.endsWith('layout.tsx') || filePath.endsWith('page.tsx')) {
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
                    logs.unshift(filePath) // Add file path only once on first error
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

/**
 * Recursively analyzes all eligible files in the provided directory.
 */
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

// Run the analysis.
// Usage: ts-node checkServerActions.ts [--verbose] [<path-to-nextjs-app>]
analyzeDirectory(targetDirectory)
