'use client'

import { semanticColor } from '@/theme/tokens'
import { useCallback, useState, type ReactNode } from 'react'
import dayjs from 'dayjs'
import { Anchor } from '@mantine/core'
import Link from 'next/link'
import type { StudyJobStatus } from '@/database/types'
import { StatusAlert, STATUS_ALERT_VARIANT, type StatusAlertVariant } from '@/components/study/status-alert'
import { useTimer } from '@/components/timer'
import { useIsHydrated } from '@/hooks/use-is-hydrated'
import { Routes } from '@/lib/routes'
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

const SupportLink = () => (
    <Anchor component={Link} href={Routes.support} c={semanticColor('link.default')} inherit>
        here
    </Anchor>
)

const PREPARING_CODE_BODY = (
    <>
        Preparing the code to run in the secure enclave. If it stays in this status for over 1 hour, don’t hesitate to
        contact SafeInsights <SupportLink />.
    </>
)

type StageCopy = { variant: StatusAlertVariant; title: string; body: ReactNode }

const STAGE_COPY = {
    // Approval is the first stage the reviewer sees: the containerizer reports JOB-PACKAGING later, so
    // /review lands here in the gap (OTTER-673, "Code approved" always steps forward).
    'CODE-APPROVED': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: 'Outputs not ready, code approved',
        body: PREPARING_CODE_BODY,
    },
    'JOB-PACKAGING': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: 'Outputs not ready, code preparation started',
        body: PREPARING_CODE_BODY,
    },
    'JOB-READY': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: 'Outputs not ready, code queued',
        body: 'The code is packaged and ready to be picked up by the secure enclave. If it stays in this status for over 1 hour, contact your organization admin.',
    },
    'JOB-PROVISIONING': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: 'Outputs not ready, code queued',
        body: 'Preparing the secure enclave to run the code. If it stays in this status for over 1 hour, contact your organization admin.',
    },
    'JOB-RUNNING': {
        variant: STATUS_ALERT_VARIANT.informative,
        title: 'Outputs not ready, code started running',
        body: 'The code started running in the secure enclave. If it stays in this status for over 1 hour, contact your organization admin.',
    },
} satisfies Record<string, StageCopy>

type OutputsStatusAlertProps = {
    stageStatus: StudyJobStatus
    startedAt: string | Date
}

function useStartedWhen(startedAt: string | Date): string | null {
    const startedAtMs = new Date(startedAt).getTime()
    const [nowMs, setNowMs] = useState(() => Date.now())
    const tick = useCallback(() => setNowMs(Date.now()), [])
    useTimer({
        isEnabled: elapsedMinutes(startedAtMs, nowMs) < DAY_MINUTES,
        every: { 1: 'minute' },
        trigger: tick,
    })
    const isHydrated = useIsHydrated()
    // The server clock and zone are not the viewer's, so the phrase waits for the browser.
    return isHydrated ? formatStartedWhen(startedAtMs, nowMs) : null
}

// Before hydration the title ends at the stage, with the instant in the time element.
function StartedWhen({ startedAt }: { startedAt: string | Date }) {
    const phrase = useStartedWhen(startedAt)

    return (
        <>
            {phrase ? ' ' : null}
            <time dateTime={new Date(startedAt).toISOString()}>{phrase}</time>
        </>
    )
}

export function OutputsStatusAlert({ stageStatus, startedAt }: OutputsStatusAlertProps) {
    const copy = STAGE_COPY[stageStatus as keyof typeof STAGE_COPY]
    if (!copy) return null

    return (
        <StatusAlert
            variant={copy.variant}
            title={
                <>
                    {copy.title}
                    <StartedWhen startedAt={startedAt} />
                </>
            }
        >
            {copy.body}
        </StatusAlert>
    )
}
