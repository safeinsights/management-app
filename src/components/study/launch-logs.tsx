interface LaunchLogsProps {
    buildLog: string
    agentLog: string
}

// The accumulated build and agent logs in a read-only textarea. Meant as the collapsible detail of a
// TimedProgressBar (which owns the disclosure and visibility).
export function LaunchLogs({ buildLog, agentLog }: LaunchLogsProps) {
    const text = ['--------- Build Log', buildLog, '--------- Agent Log', agentLog].join('\n')

    return <textarea readOnly value={text} rows={24} style={{ width: '100%' }} />
}
