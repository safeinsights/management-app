import * as ts from 'typescript'

const PAGE_EXPORTS = ['default', 'generateMetadata']

// Server components with a module-level 'use server' and no actions, with the exports each may have.
// Next.js treats every export of such a module as a server function, so any other export fails.
// Listed by full path, so a new file with one of these names is still checked.
export const IGNORE = new Map<string, string[]>([
    ['src/app/[orgSlug]/dashboard/page.tsx', PAGE_EXPORTS],
    ['src/app/[orgSlug]/study/[studyId]/agreements/researcher/page.tsx', PAGE_EXPORTS],
    ['src/app/[orgSlug]/study/[studyId]/agreements/reviewer/page.tsx', PAGE_EXPORTS],
    ['src/app/[orgSlug]/study/[studyId]/code/page.tsx', PAGE_EXPORTS],
    ['src/app/[orgSlug]/study/[studyId]/review/code/page.tsx', PAGE_EXPORTS],
    ['src/app/[orgSlug]/study/[studyId]/review/page.tsx', PAGE_EXPORTS],
    ['src/app/[orgSlug]/study/[studyId]/review/proposal/page.tsx', PAGE_EXPORTS],
    ['src/app/[orgSlug]/study/request/page.tsx', PAGE_EXPORTS],
    ['src/components/layout/focused-layout.tsx', ['FocusedLayout']],
    ['src/components/layout/user-layout.tsx', ['UserLayout']],
])

// public: callable without a session. checked-in-handler: the handler authorizes the caller inline.
// session-scoped: acts only on the caller's own session.
type AbilityCheckException = {
    kind: 'public' | 'checked-in-handler' | 'session-scoped'
    reason: string
}

// Every entry skips the requireAbilityTo rule. Removing the inline check an entry relies on makes
// that action unauthenticated, so change the handler and this table together.
export const ABILITY_CHECK_EXCEPTIONS: Record<string, AbilityCheckException> = {
    'src/server/actions/create-account.actions.ts#getOrgInfoForInviteAction': {
        kind: 'public',
        reason: 'Deliberately session-less: the link is opened before the recipient has an account.',
    },
    'src/server/actions/create-account.actions.ts#getClaimedInviteAction': {
        kind: 'checked-in-handler',
        reason: 'Needs a session; the claimedByUserId match is the authorization.',
    },
    'src/server/actions/create-account.actions.ts#onRevokeInviteAction': {
        kind: 'checked-in-handler',
        reason: 'The bearer of an unclaimed invite may decline it; org admin is checked inline for claimed invites.',
    },
    'src/server/actions/create-account.actions.ts#onJoinTeamAccountAction': {
        kind: 'checked-in-handler',
        reason: 'Bearer invite credential; the identity comes from the session (OTTER-724 / MA-9).',
    },
    'src/server/actions/create-account.actions.ts#onCreateAccountAction': {
        kind: 'public',
        reason: 'Runs before an account exists.',
    },
    'src/server/actions/link-preview.actions.ts#resolveInternalLinkAction': {
        kind: 'checked-in-handler',
        reason: 'Returns UNAVAILABLE without a session; access to each route is checked inline.',
    },
    'src/server/actions/legal-document.actions.ts#fetchGlobalLegalDocumentsAction': {
        kind: 'public',
        reason: 'Readable without a session: the invitation signup form renders these before an account exists.',
    },
    'src/server/actions/legal-document.actions.ts#fetchParticipationAgreementFromInviteIdAction': {
        kind: 'public',
        reason: 'Unauthenticated by necessity: the signup form has only the invite id.',
    },
    'src/server/actions/user.actions.ts#onUserSignInAction': {
        kind: 'session-scoped',
        reason: 'Throws without a Clerk session; it only records the sign-in of that session user.',
    },
    'src/server/actions/user.actions.ts#currentUserInfoAction': {
        kind: 'session-scoped',
        reason: 'Read-only: returns the caller its own org list, or null without a session.',
    },
}

export type AnalyzedAction = { name: string; guarded: boolean }

const ACTION_FORM = `const xAction = new Action('xAction')...handler(...)`

export function hasUseServerDirective(node: ts.SourceFile | ts.Block): boolean {
    for (const statement of node.statements) {
        if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false
        if (statement.expression.text === 'use server') return true
    }
    return false
}

function functionBodies(sourceFile: ts.SourceFile): ts.Block[] {
    const bodies: ts.Block[] = []
    const visit = (node: ts.Node) => {
        if (ts.isFunctionLike(node) && 'body' in node && node.body && ts.isBlock(node.body)) {
            bodies.push(node.body)
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return bodies
}

function hasExportModifier(node: ts.Node) {
    return ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
}

function isTypeOnlyExport(node: ts.ExportDeclaration) {
    if (node.isTypeOnly) return true
    const clause = node.exportClause
    return !!clause && ts.isNamedExports(clause) && clause.elements.every((el) => el.isTypeOnly)
}

function runtimeExportNames(sourceFile: ts.SourceFile): string[] {
    const names: string[] = []
    for (const statement of sourceFile.statements) {
        if (ts.isExportDeclaration(statement)) {
            if (isTypeOnlyExport(statement)) continue
            const clause = statement.exportClause
            if (clause && ts.isNamedExports(clause)) {
                names.push(...clause.elements.filter((el) => !el.isTypeOnly).map((el) => el.name.text))
            } else {
                names.push('*')
            }
            continue
        }
        if (ts.isExportAssignment(statement)) {
            names.push('default')
            continue
        }
        if (!hasExportModifier(statement)) continue
        if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue
        if (ts.isVariableStatement(statement)) {
            names.push(...statement.declarationList.declarations.map((decl) => decl.name.getText(sourceFile)))
            continue
        }
        const isDefault =
            ts.canHaveModifiers(statement) &&
            !!ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
        const declared =
            ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)
                ? statement.name?.text
                : undefined
        names.push(isDefault ? 'default' : (declared ?? '<unnamed>'))
    }
    return names
}

// Walks `new Action('<name>').a(...).b(...).handler(...)` from the outside in.
function actionChain(initializer: ts.Expression) {
    if (
        !ts.isCallExpression(initializer) ||
        !ts.isPropertyAccessExpression(initializer.expression) ||
        initializer.expression.name.text !== 'handler'
    ) {
        return null
    }

    const methods: string[] = []
    let current: ts.Expression = initializer
    while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
        if (ts.isPropertyAccessExpression(current)) methods.push(current.name.text)
        current = current.expression
    }

    if (!ts.isNewExpression(current) || !ts.isIdentifier(current.expression) || current.expression.text !== 'Action') {
        return null
    }
    const [firstArg] = current.arguments ?? []
    if (!firstArg || !ts.isStringLiteral(firstArg)) return null

    return { actionName: firstArg.text, methods }
}

function analyzeExports(sourceFile: ts.SourceFile, errors: string[], actions: AnalyzedAction[]) {
    const unsupported = `unsupported export form; export actions as ${ACTION_FORM}`

    for (const statement of sourceFile.statements) {
        if (ts.isExportDeclaration(statement)) {
            if (!isTypeOnlyExport(statement)) errors.push(unsupported)
            continue
        }
        if (ts.isExportAssignment(statement)) {
            errors.push(unsupported)
            continue
        }
        if (!hasExportModifier(statement)) continue
        if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue

        const isConst =
            ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
        if (!isConst) {
            errors.push(unsupported)
            continue
        }

        for (const decl of statement.declarationList.declarations) {
            const name = decl.name.getText(sourceFile)
            const chain = decl.initializer && actionChain(decl.initializer)
            if (!chain) {
                errors.push(`${name} must be exported as ${ACTION_FORM}`)
                continue
            }
            if (!name.endsWith('Action')) {
                errors.push(`${name} is not named correctly, it should end in 'Action'`)
            }
            if (chain.actionName !== name) {
                errors.push(
                    `action name in constructor ('${chain.actionName}') does not match variable name ('${name}')`,
                )
            }
            actions.push({ name, guarded: chain.methods.includes('requireAbilityTo') })
        }
    }
}

export function analyzeSource(filePath: string, content: string): { errors: string[]; actions: AnalyzedAction[] } {
    const errors: string[] = []
    const actions: AnalyzedAction[] = []
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)

    if (content.includes('use server')) {
        for (const body of functionBodies(sourceFile)) {
            if (hasUseServerDirective(body)) {
                errors.push(
                    `function-level 'use server' is not allowed; define the action in src/server/actions as ${ACTION_FORM}`,
                )
            }
        }
    }

    if (!hasUseServerDirective(sourceFile)) {
        return { errors, actions }
    }

    const allowedExports = IGNORE.get(filePath)
    if (allowedExports) {
        for (const name of runtimeExportNames(sourceFile)) {
            if (!allowedExports.includes(name)) {
                errors.push(
                    `${name} is not a listed export of this ignored 'use server' module; move it to src/server/actions`,
                )
            }
        }
        return { errors, actions }
    }

    if (!filePath.startsWith('src/server/actions/')) {
        errors.push('server action modules belong in src/server/actions')
    }

    analyzeExports(sourceFile, errors, actions)

    for (const action of actions) {
        if (!action.guarded && !ABILITY_CHECK_EXCEPTIONS[`${filePath}#${action.name}`]) {
            errors.push(
                `${action.name} has no requireAbilityTo; add one or list it in ABILITY_CHECK_EXCEPTIONS with a reason`,
            )
        }
    }

    return { errors, actions }
}

export function findStaleExceptions(seen: { key: string; guarded: boolean }[]): string[] {
    return Object.keys(ABILITY_CHECK_EXCEPTIONS).filter((key) => {
        const action = seen.find((s) => s.key === key)
        return !action || action.guarded
    })
}
