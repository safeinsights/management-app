import Anthropic from '@anthropic-ai/sdk'
import { buildAnalysisPrompt, DEFAULT_SYSTEM_INSTRUCTION } from './prompts'
import { analysisReportSchema } from './types'
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

const RETRY_NUDGE =
    'Your previous response did not call the `submit_analysis` tool with the exact required shape. ' +
    'You MUST call `submit_analysis` exactly once. Every required field must be a real value of the ' +
    'correct type — `alignmentCheck` and `complianceCheck` must each be objects with `isAligned`/' +
    '`isCompliant` (boolean) and `findings` (array of strings). Do not return XML, parameter tags, ' +
    'or string fragments — only the structured tool call.'

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

function extractToolInput(response: Anthropic.Messages.Message): unknown {
    const toolUse = response.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock =>
            block.type === 'tool_use' && block.name === ANALYSIS_TOOL_NAME,
    )

    if (!toolUse) {
        throw new Error('The model did not return a structured analysis.')
    }

    return toolUse.input
}

function parseReport(input: unknown): AnalysisReport {
    return analysisReportSchema.parse(input)
}

/**
 * Run a one-shot structured review. Returns the parsed report plus the
 * conversation seed (`messages`) — persist `messages` to enable chat follow-up.
 *
 * If the first response fails schema validation, retries once with a stricter
 * nudge appended to the conversation. The retry path was added after a
 * Sonnet response was observed putting findings at the top level and writing
 * XML-parameter fragments into the alignmentCheck/complianceCheck slots; the
 * persisted row then crashed the UI when reading `findings.length`.
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
export async function generateAnalysis(config: ReviewAgentConfig, content: ReviewContent): Promise<AnalysisResult> {
    const client = resolveClient(config)
    const prompt = buildPromptForContent(content, config.analysisPromptTemplate)
    const model = config.model ?? DEFAULT_MODEL
    const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS
    const system = config.systemPrompt ?? DEFAULT_SYSTEM_INSTRUCTION

    const initialMessages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: prompt }]

    const firstResponse = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: 'tool', name: ANALYSIS_TOOL_NAME },
        messages: initialMessages,
    })

    const firstInput = extractToolInput(firstResponse)
    const firstParse = analysisReportSchema.safeParse(firstInput)
    if (firstParse.success) {
        return buildResult(firstParse.data, prompt)
    }

    const retryMessages: Anthropic.Messages.MessageParam[] = [
        ...initialMessages,
        { role: 'assistant', content: JSON.stringify(firstInput) },
        { role: 'user', content: RETRY_NUDGE },
    ]

    const retryResponse = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: 'tool', name: ANALYSIS_TOOL_NAME },
        messages: retryMessages,
    })

    const report = parseReport(extractToolInput(retryResponse))
    return buildResult(report, prompt)
}

function buildResult(report: AnalysisReport, prompt: string): AnalysisResult {
    const messages: ReviewMessage[] = [
        { role: 'user', content: prompt },
        { role: 'assistant', content: JSON.stringify(report) },
    ]
    return { report, messages }
}
