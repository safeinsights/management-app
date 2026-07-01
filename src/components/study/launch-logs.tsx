import { Stack, Text } from '@mantine/core'
import { formatTimeAgo } from '@/lib/relative-time'

// Relative "last updated" time. The <time> element carries the ISO timestamp (machine-readable in
// dateTime, and as the hover/alt text in title) while showing the human-friendly relative time.
// Returns null when there's no timestamp yet.
function LastUpdatedTime({ at }: { at: Date | null | undefined }) {
    const ago = formatTimeAgo(at ?? null)
    if (!at || !ago) return null
    const iso = at.toISOString()
    return (
        <Text size="xs" c="dimmed">
            Last updated{' '}
            <time dateTime={iso} title={iso}>
                {ago}
            </time>
        </Text>
    )
}

interface LaunchLogsProps {
    isVisible: boolean
    buildLog: string
    agentLog: string
    lastUpdatedAt?: Date | null
}

// Collapsible build/agent logs shown while launching. A native <details> keeps the logs hidden until
// the user clicks "Launching IDE" — no JS state needed. Returns null when not launching.
export function LaunchLogs({ isVisible, buildLog, agentLog, lastUpdatedAt }: LaunchLogsProps) {
    if (!isVisible) return null

    const text = ['--------- Build Log', buildLog, '--------- Agent Log', agentLog].join('\n')

    return (
        <details>
            <summary>Launch Details</summary>
            <Stack gap={4} mt={4}>
                <LastUpdatedTime at={lastUpdatedAt} />
                <textarea
                    readOnly
                    value={text}
                    rows={24}
                    style={{
                        width: '100%',
                    }}
                />
            </Stack>
        </details>
    )
}
