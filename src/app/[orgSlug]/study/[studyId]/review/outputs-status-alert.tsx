'use client'

import { semanticColor } from '@/theme/tokens'
import { useCallback, useState, type ReactNode } from 'react'
import dayjs from 'dayjs'
import { Anchor } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import type { StudyJobStatus } from '@/database/types'
import { StatusAlert, STATUS_ALERT_VARIANT, type StatusAlertVariant } from '@/components/study/status-alert'
import { useTimer } from '@/components/timer'
import { SAFE_INSIGHTS_SLACK_URL } from '@/lib/config'
import { plural } from '@/lib/string'

const DAY_MINUTES = 24 * 60

const elapsedMinutes = (startedAtMs: number, nowMs: number) => Math.max(0, Math.floor((nowMs - startedAtMs) / 60_000))

export function formatElapsed(startedAtMs: number, nowMs: number): string {
    const totalMinutes = elapsedMinutes(startedAtMs, nowMs)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    const minutesPart = plural(minutes, 'minute')
    if (hours === 0) return minutesPart
    const hoursPart = plural(hours, 'hour')
    return minutes === 0 ? hoursPart : `${hoursPart} and ${minutesPart}`
}

export function formatStartedWhen(startedAtMs: number, nowMs: number): string {
    if (elapsedMinutes(startedAtMs, nowMs) < DAY_MINUTES) return `${formatElapsed(startedAtMs, nowMs)} ago`
    return `on ${dayjs(startedAtMs).format('MMM DD, YYYY [at] h:mm A')}`
}

const SlackDPSupportLink = () => (
    <Anchor
        href={SAFE_INSIGHTS_SLACK_URL}
        target="_blank"
        rel="noopener noreferrer"
        c={semanticColor('link.default')}
        inherit
    >
        Slack
        <ArrowSquareOutIcon size={16} style={{ marginLeft: 4, verticalAlign: 'text-bottom' }} />
    </Anchor>
)

type StageCopy = { variant: StatusAlertVariant; title: (when: string) => string; body: ReactNode }

const STAGE_COPY = {
    // Approval is the first stage the reviewer sees: the containerizer reports JOB-PACKAGING later, so
    // /review lands here in the gap (OTTER-673, "Code approved" always steps forward).
    'CODE-APPROVED': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: (when) => `Outputs not ready, code approved ${when}`,
        body: (
            <>
                Preparing the code to run in the secure enclave. If it stays in this status for over 1 hour, contact
                SafeInsights via <SlackDPSupportLink />
            </>
        ),
    },
    'JOB-PACKAGING': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: (when) => `Outputs not ready, code preparation started ${when}`,
        body: 'Preparing the code to run in the secure enclave. If it stays in this status for over 1 hour, contact SafeInsights.',
    },
    'JOB-READY': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: (when) => `Outputs not ready, code queued ${when}`,
        body: 'The code is packaged and ready to be picked up by the secure enclave. If it stays in this status for over 1 hour, contact your organization admin.',
    },
    'JOB-PROVISIONING': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: (when) => `Outputs not ready, code queued ${when}`,
        body: 'Preparing the secure enclave to run the code. If it stays in this status for over 1 hour, contact your organization admin.',
    },
    'JOB-RUNNING': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: (when) => `Outputs not ready, code started running ${when}`,
        body: 'The code started running in the secure enclave. If it stays in this status for over 1 hour, contact your organization admin.',
    },
} satisfies Record<string, StageCopy>

type OutputsStatusAlertProps = {
    stageStatus: StudyJobStatus
    startedAt: string | Date
}

function useStartedWhen(startedAt: string | Date): string {
    const startedAtMs = new Date(startedAt).getTime()
    const [nowMs, setNowMs] = useState(() => Date.now())
    const tick = useCallback(() => setNowMs(Date.now()), [])
    useTimer({
        isEnabled: elapsedMinutes(startedAtMs, nowMs) < DAY_MINUTES,
        every: { 1: 'minute' },
        trigger: tick,
    })
    return formatStartedWhen(startedAtMs, nowMs)
}

export function OutputsStatusAlert({ stageStatus, startedAt }: OutputsStatusAlertProps) {
    const when = useStartedWhen(startedAt)
    const copy = STAGE_COPY[stageStatus as keyof typeof STAGE_COPY]
    if (!copy) return null

    return (
        <StatusAlert variant={copy.variant} title={copy.title(when)}>
            {copy.body}
        </StatusAlert>
    )
}
