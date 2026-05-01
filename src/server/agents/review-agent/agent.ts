import Anthropic from '@anthropic-ai/sdk'
import { buildAnalysisPrompt, DEFAULT_SYSTEM_INSTRUCTION } from './prompts'
import type { AnalysisReport, AnalysisResult, ReviewAgentConfig, ReviewContent, ReviewMessage } from './types'

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_MAX_RETRIES = 3

const ANALYSIS_TOOL_NAME = 'submit_analysis'

const ANALYSIS_TOOL: Anthropic.Messages.Tool = {
    name: ANALYSIS_TOOL_NAME,
    description:
        'Submit the structured review of the research proposal. Always call this tool exactly once with the full report.',
    input_schema: {
        type: 'object',
        properties: {
            proposalSummary: { type: 'string' },
            codeExplanation: { type: 'string' },
            resultsSummary: { type: 'string' },
            alignmentCheck: {
                type: 'object',
                properties: {
                    isAligned: { type: 'boolean' },
                    findings: { type: 'array', items: { type: 'string' } },
                },
                required: ['isAligned', 'findings'],
            },
            complianceCheck: {
                type: 'object',
                properties: {
                    isCompliant: { type: 'boolean' },
                    findings: { type: 'array', items: { type: 'string' } },
                },
                required: ['isCompliant', 'findings'],
            },
        },
        required: ['proposalSummary', 'codeExplanation', 'alignmentCheck', 'complianceCheck'],
    },
}

function resolveClient(config: ReviewAgentConfig): Anthropic {
    if (config.client) return config.client
    if (config.apiKey) {
        return new Anthropic({ apiKey: config.apiKey, maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES })
    }
    throw new Error('Either apiKey or client must be provided.')
}

function formatCodeFiles(codeFiles: Record<string, string>): string {
    return Object.entries(codeFiles)
        .map(([path, content]) => '```' + path + '\n' + content + '\n' + '```')
        .join('\n\n')
}

function buildPromptForContent(content: ReviewContent, templateOverride?: string): string {
    const testResultsSection = content.researcherTestResults
        ? `\n**Researcher Test Results:**\n<TestResults>\n${content.researcherTestResults}\n</TestResults>`
        : ''

    return buildAnalysisPrompt(
        {
            proposal: content.proposal,
            code: formatCodeFiles(content.codeFiles),
            requirements: content.referenceDocs.requirements,
            brcDocs: content.referenceDocs.brcDocs,
            dataDocs: content.referenceDocs.dataDocs,
            otherDocs: content.referenceDocs.otherDocs,
            testResultsSection,
        },
        templateOverride,
    )
}

function extractReport(response: Anthropic.Messages.Message): AnalysisReport {
    const toolUse = response.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock =>
            block.type === 'tool_use' && block.name === ANALYSIS_TOOL_NAME,
    )

    if (!toolUse) {
        throw new Error('The model did not return a structured analysis.')
    }

    return toolUse.input as AnalysisReport
}

/**
 * Run a one-shot structured review. Returns the parsed report plus the
 * conversation seed (`messages`) — persist `messages` to enable chat follow-up.
 *
 * Future chat extension (target: before Oct 2026) — add alongside this fn:
 *
 *     export async function continueChat(
 *         config: ReviewAgentConfig,
 *         messages: ReviewMessage[],
 *         userMessage: string,
 *     ): Promise<{ reply: string; messages: ReviewMessage[] }>
 *
 * Caller (server action) loads `messages` from the studyReview row, appends
 * the user's question, calls `continueChat`, persists the new `messages`
 * back. Stateless — survives process restarts and queue retries.
 */
export async function generateAnalysis(
    config: ReviewAgentConfig,
    content: ReviewContent,
): Promise<AnalysisResult> {
    const client = resolveClient(config)
    const prompt = buildPromptForContent(content, config.analysisPromptTemplate)

    const response = await client.messages.create({
        model: config.model ?? DEFAULT_MODEL,
        max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: config.systemPrompt ?? DEFAULT_SYSTEM_INSTRUCTION,
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: 'tool', name: ANALYSIS_TOOL_NAME },
        messages: [{ role: 'user', content: prompt }],
    })

    const report = extractReport(response)

    const messages: ReviewMessage[] = [
        { role: 'user', content: prompt },
        { role: 'assistant', content: JSON.stringify(report) },
    ]

    return { report, messages }
}
