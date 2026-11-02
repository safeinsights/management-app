// Job statuses change only through the transition table (OTTER-973), so every write to the status
// log, and every new study job, goes through src/database/job-status-writer.ts.
const WRITE_METHODS = new Set(['insertInto', 'updateTable', 'deleteFrom', 'replaceInto', 'mergeInto'])
const STATUS_TABLES = new Set(['jobStatusChange', 'job_status_change'])
const JOB_TABLES = new Set(['studyJob', 'study_job'])
const RAW_WRITE = /(insert\s+into|update|delete\s+from)\s+("?public"?\.)?"?job_status_change\b/i

const stringValue = (node) => {
    if (!node) return null
    if (node.type === 'Literal' && typeof node.value === 'string') return node.value
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked
    return null
}

// `'jobStatusChange as jsc'` names the same table.
const tableName = (value) => value.replace(/\s+as\s+\w+$/i, '').trim()

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
                if (!WRITE_METHODS.has(method)) return
                const value = stringValue(node.arguments[0])
                if (!value) return
                const table = tableName(value)
                if (STATUS_TABLES.has(table) || (method === 'insertInto' && JOB_TABLES.has(table))) report(node)
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
