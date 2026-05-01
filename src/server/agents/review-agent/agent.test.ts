import { describe, it, expect, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { generateAnalysis } from './agent'
import type { AnalysisReport, ReviewContent } from './types'

const baseReport: AnalysisReport = {
    proposalSummary: 'summary',
    codeExplanation: 'explanation',
    alignmentCheck: { isAligned: true, findings: [] },
    complianceCheck: { isCompliant: true, findings: [] },
}

const baseContent: ReviewContent = {
    proposal: 'p',
    codeFiles: { 'main.r': 'print("hi")' },
    referenceDocs: { requirements: 'r', brcDocs: 'b', dataDocs: 'd', otherDocs: 'o' },
}

function makeClient(content: unknown) {
    const create = vi.fn().mockResolvedValue({ content })
    return { client: { messages: { create } } as unknown as Anthropic, create }
}

const toolUseBlock = [{ type: 'tool_use', name: 'submit_analysis', id: '1', input: baseReport }]

describe('generateAnalysis', () => {
    it('returns the structured report from a tool_use block', async () => {
        const { client, create } = makeClient(toolUseBlock)

        const report = await generateAnalysis({ client }, baseContent)

        expect(report).toEqual(baseReport)
        expect(create).toHaveBeenCalledOnce()
    })

    it('passes config overrides to the client', async () => {
        const { client, create } = makeClient(toolUseBlock)

        await generateAnalysis(
            { client, model: 'claude-opus-4-7', maxTokens: 1024, systemPrompt: 'custom system' },
            baseContent,
        )

        const args = create.mock.calls[0][0]
        expect(args.model).toBe('claude-opus-4-7')
        expect(args.max_tokens).toBe(1024)
        expect(args.system).toBe('custom system')
        expect(args.tool_choice).toEqual({ type: 'tool', name: 'submit_analysis' })
    })

    it('embeds code files and proposal in the user message', async () => {
        const { client, create } = makeClient(toolUseBlock)

        await generateAnalysis({ client }, baseContent)

        const userMessage = create.mock.calls[0][0].messages[0].content as string
        expect(userMessage).toContain('main.r')
        expect(userMessage).toContain('print("hi")')
        expect(userMessage).toContain('p')
    })

    it('includes test results section when present', async () => {
        const { client, create } = makeClient(toolUseBlock)

        await generateAnalysis({ client }, { ...baseContent, researcherTestResults: 'PASS' })

        const userMessage = create.mock.calls[0][0].messages[0].content as string
        expect(userMessage).toContain('Researcher Test Results')
        expect(userMessage).toContain('PASS')
    })

    it('throws when the model omits the tool call', async () => {
        const { client } = makeClient([{ type: 'text', text: 'no tool', citations: null }])

        await expect(generateAnalysis({ client }, baseContent)).rejects.toThrow(/structured analysis/)
    })

    it('throws when neither apiKey nor client is provided', async () => {
        await expect(generateAnalysis({}, baseContent)).rejects.toThrow(/apiKey or client/)
    })
})
