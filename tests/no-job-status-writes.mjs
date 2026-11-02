// Job statuses change only through the transition table (OTTER-973), so every write to the status
// log, every new or deleted study job, and every write to the job state columns goes through
// src/database/job-status-writer.ts. A deleted job shifts the stored round of the jobs after it.
const WRITE_METHODS = new Set(['insertInto', 'updateTable', 'deleteFrom', 'replaceInto', 'mergeInto'])
const STATUS_TABLES = new Set(['jobStatusChange', 'job_status_change'])
const JOB_TABLES = new Set(['studyJob', 'study_job'])
const RAW_WRITE = /(insert\s+into|update|delete\s+from)\s+("?public"?\.)?"?(job_status_change|study_job)\b/i
// The job state columns the writer keeps in step with the log.
const STATE_COLUMNS = new Set(['currentStatus', 'current_status', 'round', 'statusChangedAt', 'status_changed_at'])

const stringValue = (node) => {
    if (!node) return null
    if (node.type === 'Literal' && typeof node.value === 'string') return node.value
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked
    return null
}

// `'jobStatusChange as jsc'` names the same table.
const tableName = (value) => value.replace(/\s+as\s+\w+$/i, '').trim()

// The `updateTable('studyJob')` call somewhere below a `.set(...)` in the same chain.
const updatesStudyJob = (node) => {
    for (let current = node; current; ) {
        if (current.type === 'CallExpression') {
            const { callee } = current
            if (
                callee.type === 'MemberExpression' &&
                !callee.computed &&
                callee.property.name === 'updateTable' &&
                JOB_TABLES.has(tableName(stringValue(current.arguments[0]) ?? ''))
            ) {
                return true
            }
            current = callee
        } else if (current.type === 'MemberExpression') {
            current = current.object
        } else {
            return false
        }
    }
    return false
}

const isStateColumn = (property) =>
    property.type === 'SpreadElement' ||
    (property.type === 'Property' &&
        (property.computed ||
            STATE_COLUMNS.has(property.key.type === 'Identifier' ? property.key.name : String(property.key.value))))

// A spread, a computed key or a callback that is not a plain object literal cannot be checked, so it counts.
const setsStateColumn = (argument) => {
    if (!argument) return false
    if (argument.type === 'ObjectExpression') return argument.properties.some(isStateColumn)
    if (argument.type === 'ArrowFunctionExpression' || argument.type === 'FunctionExpression') {
        return argument.body.type !== 'ObjectExpression' || argument.body.properties.some(isStateColumn)
    }
    return true
}

const isSqlTag = (tag) => tag.type === 'Identifier' && tag.name === 'sql'

const isSqlRaw = (callee) =>
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    isSqlTag(callee.object) &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'raw'

const noJobStatusWrites = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Write job statuses and open study jobs only through the job status writer',
            recommended: false,
        },
        schema: [],
        messages: {
            directWrite:
                'Write job statuses with transitionJob() from @/server/job-transitions, or writeJobStatus() in scripts and fixtures.',
        },
    },
    create(context) {
        const report = (node) => context.report({ node, messageId: 'directWrite' })

        return {
            CallExpression(node) {
                const { callee } = node
                if (isSqlRaw(callee)) {
                    const text = stringValue(node.arguments[0])
                    if (text && RAW_WRITE.test(text)) report(node)
                    return
                }
                if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') {
                    return
                }
                const method = callee.property.name
                if (method === 'set' && setsStateColumn(node.arguments[0]) && updatesStudyJob(callee.object)) {
                    report(node)
                    return
                }
                if (!WRITE_METHODS.has(method)) return
                const value = stringValue(node.arguments[0])
                if (!value) return
                const table = tableName(value)
                const writesJobRow = (method === 'insertInto' || method === 'deleteFrom') && JOB_TABLES.has(table)
                if (STATUS_TABLES.has(table) || writesJobRow) report(node)
            },
            TaggedTemplateExpression(node) {
                if (!isSqlTag(node.tag)) return
                const text = node.quasi.quasis.map((quasi) => quasi.value.cooked).join(' ')
                if (RAW_WRITE.test(text)) report(node)
            },
        }
    },
}

export default noJobStatusWrites
