import * as ts from 'typescript'
import * as fs from 'fs'
import * as path from 'path'

const WRAPPERS = ['adminAction', 'researcherAction', 'memberAction', 'userAction', 'anonAction']

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
    if (ts.isCallExpression(node)) {
        const callee = node.expression
        // Check if the callee is an identifier named "serverAction"
        if (ts.isIdentifier(callee)) {
            const wrapper = WRAPPERS.find((wrapper) => wrapper == callee.escapedText)
            return wrapper || false
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

                        // // If the initializer is a call to serverAction, we consider it properly wrapped.
                        // if (isServerActionWrapped(decl.initializer)) {
                        //   } else {
                        //     results.push({ name: varName, wrapped: false });
                        //   }
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
    if (filePath.endsWith('layout.tsx')) {
        return true // layouts can do whatever
    } else if (filePath.endsWith('page.tsx')) {
        return functionName.endsWith('Page')
    } else {
        return functionName.endsWith('Action')
    }
}

function isActionsFile(filePath: string) {
    return filePath.endsWith('actions.ts')
}

/**
 * Analyzes a single file: checks if it contains the "use server" directive,
 * then parses its AST to check for exported functions and if they are wrapped.
 */
function analyzeFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf8')
    let success = true
    if (content.includes("'use server'") || content.includes('"use server"')) {
        const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
        const exportedFunctions = checkExportedFunctions(sourceFile)
        if (exportedFunctions.length > 0) {
            console.log(filePath)
            exportedFunctions.forEach((func) => {
                const named = isProperlyNamed(filePath, func.name)
                const wrapped = isActionsFile(filePath) ? func.wrapper : true
                const isOk = named && wrapped
                console.log(`   ${isOk ? '✓' : '✗'} ${func.name}`)
                if (!isOk) {
                    if (!named) console.error(`     is not named correctly, should end in 'Action'`)
                    if (!wrapped)
                        console.error(
                            `     is not named wrapped, should be wrapped in one of the access control functions`,
                        )
                    success = false
                }
            })
        }
    }

    return success
}

/**
 * Recursively analyzes all eligible files in the provided directory.
 */
function analyzeDirectory(directoryPath: string): void {
    const files = getAllFiles(directoryPath)
    let success = true
    for (const file of files) {
        if (!analyzeFile(file)) {
            success = false
        }
    }
    if (!success) {
        console.error('Some files failed the analysis.')
        process.exit(1)
    }
}

// Run the analysis.
// Usage: ts-node checkServerActions.ts <path-to-nextjs-app>
// If no directory is provided, it defaults to the current working directory.
const targetDirectory = process.argv[2] || '.'
analyzeDirectory(targetDirectory)
