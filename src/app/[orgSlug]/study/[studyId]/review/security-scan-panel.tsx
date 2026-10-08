import { Group, Loader, Text } from '@mantine/core'
import { CheckCircleIcon, WarningCircleIcon, XCircleIcon } from '@phosphor-icons/react/dist/ssr'
import type { JobScanResult } from '@/server/db/queries'
import { semanticColor } from '@/theme/tokens'
import { AnalysisPanel } from './analysis-panel'

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
                <Loader size="sm" aria-label="Scan pending" />
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

export function SecurityScanPanel({ scan, hasError }: { scan: JobScanResult | null; hasError: boolean }) {
    return (
        <AnalysisPanel
            title="Security scan results"
            description="Automated security scan of submitted code files."
            testId="security-scan-results"
        >
            <ScanResult scan={scan} hasError={hasError} />
        </AnalysisPanel>
    )
}
