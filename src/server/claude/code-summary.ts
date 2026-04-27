import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/database'
import logger from '@/lib/logger'
import { getConfigValue } from '@/server/config'
import { fetchFileContents } from '@/server/storage'

const MAX_FILE_SIZE_BYTES = 100_000

export interface CodeSummaryItem {
    question: string
    answer: string
}

const SUMMARY_QUESTIONS = [
    { id: 'q1', question: 'What is this code doing at a high level?' },
    { id: 'q2', question: 'What data sources does this code access or use?' },
    { id: 'q3', question: 'What outputs or results does this code produce?' },
    { id: 'q4', question: 'What external libraries or packages does this code rely on?' },
    { id: 'q5', question: 'Are there any potential data privacy or security concerns in this code?' },
] as const

async function fetchCodeFiles(studyJobId: string): Promise<{ name: string; content: string }[]> {
    const files = await db
        .selectFrom('studyJobFile')
        .select(['name', 'path'])
        .where('studyJobId', '=', studyJobId)
        .where('fileType', 'in', ['MAIN-CODE', 'SUPPLEMENTAL-CODE'])
        .execute()

    const results: { name: string; content: string }[] = []
    for (const file of files) {
        const blob = await fetchFileContents(file.path)
        if (blob.size > MAX_FILE_SIZE_BYTES) {
            logger.warn(`Skipping oversized file for code summary`, { name: file.name, size: blob.size, studyJobId })
            continue
        }
        results.push({ name: file.name, content: await blob.text() })
    }
    return results
}

function buildUserMessage(files: { name: string; content: string }[]): string {
    const fileContents = files.map((f) => `### ${f.name}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')
    const questionList = SUMMARY_QUESTIONS.map((q) => `- ${q.id}: ${q.question}`).join('\n')

    return `Analyze the following research code files and answer each question concisely.

${fileContents}

Questions:
${questionList}

Call the submit_code_summary tool with your answers.`
}

const SUMMARY_TOOL = {
    name: 'submit_code_summary',
    description: 'Submit concise answers to each code-summary question.',
    input_schema: {
        type: 'object' as const,
        properties: {
            answers: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', enum: SUMMARY_QUESTIONS.map((q) => q.id) },
                        answer: { type: 'string' },
                    },
                    required: ['id', 'answer'],
                    additionalProperties: false,
                },
            },
        },
        required: ['answers'],
        additionalProperties: false,
    },
}

export async function generateAndStoreCodeSummary(studyJobId: string): Promise<void> {
    logger.info(`Generating code summary`, { studyJobId })
    const files = await fetchCodeFiles(studyJobId)
    if (files.length === 0) {
        logger.warn(`No code files found for code summary`, { studyJobId })
        return
    }

    const apiKey = await getConfigValue('CLAUDE_API_KEY')
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: 'You are reviewing research code submitted for secure data analysis.',
        tools: [SUMMARY_TOOL],
        tool_choice: { type: 'tool', name: SUMMARY_TOOL.name },
        messages: [{ role: 'user', content: buildUserMessage(files) }],
    })

    const toolUse = response.content.find((block) => block.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error(`Expected tool_use response from Claude, got: ${response.stop_reason}`)
    }

    const { answers } = toolUse.input as { answers: { id: string; answer: string }[] }

    const items: CodeSummaryItem[] = SUMMARY_QUESTIONS.map((q) => ({
        question: q.question,
        answer: answers.find((a) => a.id === q.id)?.answer ?? '',
    }))

    await db
        .insertInto('studyCodeSummary')
        .values({
            studyJobId,
            generatedAt: new Date(),
            summary: JSON.stringify(items),
        })
        .execute()

    logger.info(`Code summary generated and stored`, { studyJobId })
}
