#!/usr/bin/env -S pnpm exec tsx
/* eslint-disable no-console */

// Debug harness for the AI code-summary / review-agent.
//
// Why this exists: in prod the review runs inside `deferred()` (see
// src/server/events.ts), which catches every error, logs to Sentry, and writes
// NOTHING to the DB. The frontend then polls forever showing a spinner — neither
// a summary nor a visible error. This script runs the SAME agent code path
// against arbitrary local files and prints the full process + any error, so the
// swallowed failure becomes visible.
//
// It bypasses the DB and S3 entirely: `generateAnalysis` is a pure function that
// takes code files as plain strings. Only needs CLAUDE_API_KEY (loaded from .env)
// and network. Run on the HOST — no docker required.
//
// Usage:
//   ./bin/debug-review.ts <file> [<file> ...]
//   ./bin/debug-review.ts ~/Downloads/data-exploration.rR ~/Downloads/data-exploration_2026-05-14.rRdata
//
// Env knobs:
//   ANTHROPIC_MODEL   override model (defaults to claude-sonnet-4-6, same as agent)
//   REVIEW_PROPOSAL   proposal text (defaults to a placeholder)

import 'dotenv/config'
import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { ANALYSIS_TOOL, generateAnalysis } from '@/server/agents/review-agent/agent'
import { buildAnalysisPrompt, DEFAULT_SYSTEM_INSTRUCTION } from '@/server/agents/review-agent/prompts'
import type { ReviewContent } from '@/server/agents/review-agent/types'

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
const MAX_TOKENS = 16_000 // mirrors DEFAULT_MAX_TOKENS in agent.ts
const PLACEHOLDER = '(none provided)'

function looksBinary(buf: Buffer): boolean {
    // Same heuristic the human eye uses: a NUL byte in the first 8KB means it's
    // not text. .RData / .rds / images / zips all trip this.
    const slice = buf.subarray(0, 8192)
    return slice.includes(0)
}

function loadFiles(paths: string[]): Record<string, string> {
    const codeFiles: Record<string, string> = {}
    console.log('\n=== INPUT FILES ===')
    for (const p of paths) {
        const buf = readFileSync(p)
        const size = statSync(p).size
        const name = basename(p)
        const binary = looksBinary(buf)
        const text = buf.toString('utf8')
        console.log(
            `• ${name}  ${size.toLocaleString()} bytes  ${binary ? '⚠️  BINARY (not text!)' : 'text'}  ` +
                `~${Math.ceil(text.length / 4).toLocaleString()} est. tokens`,
        )
        if (binary) {
            console.log(
                `    ↳ This is exactly what breaks in prod: the app reads it via blob.text() and feeds\n` +
                    `      the garbage straight into the prompt. .RData is gzipped binary, not R source.`,
            )
        }
        codeFiles[name] = text
    }
    return codeFiles
}

async function main() {
    const paths = process.argv.slice(2)
    if (paths.length === 0) {
        console.error('Usage: ./bin/debug-review.ts <file> [<file> ...]')
        process.exit(1)
    }
    if (!process.env.CLAUDE_API_KEY) {
        console.error('CLAUDE_API_KEY not set (expected in .env). Aborting.')
        process.exit(1)
    }

    const codeFiles = loadFiles(paths)
    const content: ReviewContent = {
        proposal: process.env.REVIEW_PROPOSAL ?? PLACEHOLDER,
        codeFiles,
        referenceDocs: { requirements: PLACEHOLDER, brcDocs: PLACEHOLDER, dataDocs: PLACEHOLDER, otherDocs: PLACEHOLDER },
    }

    // --- Raw pass: do the exact messages.create the agent does, but dump the
    //     full response so we can see stop_reason / usage / blocks even on the
    //     degenerate paths (refusal, max_tokens truncation) that the agent turns
    //     into thrown errors.
    const prompt = buildAnalysisPrompt({
        proposal: content.proposal,
        code: Object.entries(codeFiles)
            .map(([path, c]) => '```' + path + '\n' + c + '\n```')
            .join('\n\n'),
        requirements: PLACEHOLDER,
        brcDocs: PLACEHOLDER,
        dataDocs: PLACEHOLDER,
        otherDocs: PLACEHOLDER,
        testResultsSection: '',
    })
    console.log('\n=== PROMPT ===')
    console.log(`model: ${MODEL}   max_tokens: ${MAX_TOKENS}   prompt chars: ${prompt.length.toLocaleString()}`)

    const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY, maxRetries: 0 })
    console.log('\n=== RAW CLAUDE CALL ===')
    const started = Date.now()
    try {
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: DEFAULT_SYSTEM_INSTRUCTION,
            tools: [ANALYSIS_TOOL],
            tool_choice: { type: 'tool', name: 'submit_analysis' },
            messages: [{ role: 'user', content: prompt }],
        })
        console.log(`elapsed: ${Date.now() - started}ms`)
        console.log(`stop_reason: ${response.stop_reason}`)
        console.log(`usage:`, response.usage)
        console.log(`content blocks: ${response.content.map((b) => b.type).join(', ')}`)
        const toolUse = response.content.find((b) => b.type === 'tool_use')
        if (toolUse && toolUse.type === 'tool_use') {
            console.log('\n=== STRUCTURED REPORT ===')
            console.log(JSON.stringify(toolUse.input, null, 2))
        } else {
            console.log('\n⚠️  No tool_use block — this is what produces "no summary, no error" in prod.')
            console.log('full response:', JSON.stringify(response, null, 2))
        }
    } catch (err) {
        console.log(`elapsed: ${Date.now() - started}ms`)
        console.error('\n❌ RAW CALL THREW (in prod this is swallowed by deferred()):')
        console.error(err)
        if (err instanceof Anthropic.APIError) {
            console.error('status:', err.status, 'name:', err.name)
        }
    }

    // --- Real pass: run the agent's own generateAnalysis so we exercise the
    //     exact extract + zod-validate path the app uses.
    console.log('\n=== AGENT generateAnalysis() (real code path) ===')
    try {
        const { report } = await generateAnalysis({ apiKey: process.env.CLAUDE_API_KEY }, content)
        console.log('✅ success:')
        console.log(JSON.stringify(report, null, 2))
    } catch (err) {
        console.error('❌ generateAnalysis threw (this is the error prod hides):')
        console.error(err)
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
