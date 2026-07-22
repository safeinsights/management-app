'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Anchor } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import type { StudyJobStatus } from '@/database/types'
import { StatusAlert, STATUS_ALERT_VARIANT, type StatusAlertVariant } from '@/components/study/status-alert'

const SAFE_INSIGHTS_SLACK_URL = 'https://openstax.slack.com/archives/C081BN1R8CE'

export function formatElapsed(startedAtMs: number, nowMs: number): string {
    const totalMinutes = Math.max(0, Math.floor((nowMs - startedAtMs) / 60_000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    const minutesPart = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
    if (hours === 0) return minutesPart
    const hoursPart = `${hours} ${hours === 1 ? 'hour' : 'hours'}`
    return minutes === 0 ? hoursPart : `${hoursPart} and ${minutesPart}`
}

const SlackLink = () => (
    <Anchor href={SAFE_INSIGHTS_SLACK_URL} target="_blank" rel="noopener noreferrer" c="blue.7" inherit>
        Slack
        <ArrowSquareOutIcon size={16} style={{ marginLeft: 4, verticalAlign: 'text-bottom' }} />
    </Anchor>
)

type StageCopy = { variant: StatusAlertVariant; title: (elapsed: string) => string; body: ReactNode }

const STAGE_COPY = {
    'JOB-PACKAGING': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: (timeElapsed) => `Outputs not ready, code packaging started ${timeElapsed} ago`,
        body: (
            <>
                Preparing the code to run in the secure enclave. If it stays in this status for over 1 hour, contact
                SafeInsights via <SlackLink />
            </>
        ),
    },
    'JOB-READY': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: (timeElapsed) => `Outputs not ready, code queued ${timeElapsed} ago`,
        body: 'The code is packaged and ready to be picked up by the secure enclave. If it stays in this status for over 1 hour, contact your organization admin.',
    },
    'JOB-PROVISIONING': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: (timeElapsed) => `Outputs not ready, code queued ${timeElapsed} ago`,
        body: 'Preparing the secure enclave to run the code. If it stays in this status for over 1 hour, contact your organization admin.',
    },
    'JOB-RUNNING': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: (timeElapsed) => `Outputs not ready, code processing started ${timeElapsed} ago`,
        body: 'The code started running in the secure enclave. If it stays in this status for over 1 hour, contact your organization admin.',
    },
} satisfies Record<string, StageCopy>

type OutputsStatusAlertProps = {
    stageStatus: StudyJobStatus
    startedAt: string | Date
}

// Elapsed time since `startedAt`, re-rendering each minute so the display never freezes.
function useElapsed(startedAt: string | Date): string {
    const startedAtMs = new Date(startedAt).getTime()
    const [nowMs, setNowMs] = useState(() => Date.now())
    useEffect(() => {
        const id = setInterval(() => setNowMs(Date.now()), 60_000)
        return () => clearInterval(id)
    }, [])
    return formatElapsed(startedAtMs, nowMs)
}

export function OutputsStatusAlert({ stageStatus, startedAt }: OutputsStatusAlertProps) {
    const elapsed = useElapsed(startedAt)
    const copy = STAGE_COPY[stageStatus as keyof typeof STAGE_COPY]
    if (!copy) return null

    return (
        <StatusAlert variant={copy.variant} title={copy.title(elapsed)}>
            {copy.body}
        </StatusAlert>
    )
}
