import { Group, Loader, Text } from '@mantine/core'
import { CheckCircleIcon, WarningCircleIcon, XCircleIcon } from '@phosphor-icons/react/dist/ssr'
import type { JobScanResult } from '@/server/db/queries'
import { semanticColor } from '@/theme/tokens'
import { AnalysisPanel, ExpandableDetails } from './analysis-panel'

export function isScanPending(scan: JobScanResult | null | undefined) {
    return scan?.semgrep == null
}

function ScanResult({ scan, hasError }: { scan: JobScanResult | null; hasError: boolean }) {
    const status = scan?.semgrep ?? null
    if (status === 'PASSED') {
        return (
            <Group gap="xs" c={semanticColor('success.text')} role="status">
                <CheckCircleIcon size={20} weight="fill" aria-label="Passed" />
                <Text size="sm">Semgrep: Passed</Text>
            </Group>
        )
    }
    if (status === 'FAILED') {
        return (
            <Group gap="xs" c={semanticColor('error.text')} role="status">
                <XCircleIcon size={20} weight="fill" aria-label="Failed" />
                <Text size="sm">Semgrep: Failed</Text>
            </Group>
        )
    }
    if (status == null && !hasError) {
        return (
            <Group gap="xs" role="status">
                <Loader size="sm" aria-hidden />
                <Text size="sm" c="dimmed">
                    Security scan pending
                </Text>
            </Group>
        )
    }
    return (
        <Group gap="xs" role="status">
            <WarningCircleIcon size={20} aria-label="Scan unavailable" />
            <Text size="sm" c="dimmed">
                {scanUnavailableLabel(status)}
            </Text>
        </Group>
    )
}

function scanUnavailableLabel(status: string | null) {
    if (status === 'NOT-RUN') return 'Security scan did not run'
    if (status === 'INDETERMINATE') return 'Security scan result is indeterminate'
    return 'Unable to load security scan results'
}

type ScanDetailLine = { key: number; text: string; isIndented: boolean; followsBlank: boolean }

// One Text per line keeps the indentation and blank-line breaks of the log readable without
// pre-formatted text, which the shared line clamp cannot cut through.
export function scanDetailLines(details: string): ScanDetailLine[] {
    const lines = details.split('\n')
    return lines.flatMap((line, i) =>
        line.trim()
            ? [{ key: i, text: line.trim(), isIndented: /^\s/.test(line), followsBlank: i > 0 && !lines[i - 1].trim() }]
            : [],
    )
}

function ScanDetailRow({ line }: { line: ScanDetailLine }) {
    return (
        <Text size="xs" ff="monospace" pl={line.isIndented ? 'md' : 0} mt={line.followsBlank ? 'xs' : 0}>
            {line.text}
        </Text>
    )
}

function ScanDetails({ details }: { details: string | null }) {
    if (!details) return null
    return (
        <ExpandableDetails testId="scan-details" showLabel="View full scan details" hideLabel="Hide full scan details">
            {scanDetailLines(details).map((line) => (
                <ScanDetailRow key={line.key} line={line} />
            ))}
        </ExpandableDetails>
    )
}

export function SecurityScanPanel({ scan, hasError }: { scan: JobScanResult | null; hasError: boolean }) {
    return (
        <AnalysisPanel
            title="Security scan results"
            description="Automated security scan of submitted code files."
            testId="security-scan-results"
        >
            <ScanResult scan={scan} hasError={hasError} />
            <ScanDetails details={scan?.details ?? null} />
        </AnalysisPanel>
    )
}
