import type { Browser, Page } from '@playwright/test'
import { Routes } from '@/lib/routes/definitions'
import { authFileFor, expect, goto, test, type TestingRole } from './e2e.helpers'
import { ENCLAVE_SLUG, LAB_SLUG, seedCodeApprovedAt } from './e2e.seed'

// OTTER-811. The server renders in UTC, so each instant here falls on a different local day than
// its UTC day in the browser's zone: a page that formats on the server shows the wrong day, and
// one that formats on both sides throws a hydration error.
const ZONES = [
    { timezoneId: 'America/Chicago', at: new Date('2026-09-24T01:30:00Z') },
    { timezoneId: 'Asia/Kolkata', at: new Date('2026-09-23T20:00:00Z') },
]

const HYDRATION_ERROR = /hydrat|Minified React error #(418|423|425)/i

const localParts = (at: Date, timeZone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    }).formatToParts(at)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
    return {
        day: `${part('month')} ${part('day')}, ${part('year')}`,
        hour: part('hour'),
        minute: part('minute'),
        period: part('dayPeriod'),
    }
}

const localDay = (at: Date, timeZone: string) => localParts(at, timeZone).day

// Listeners go on before navigation so an error thrown during hydration is not missed.
const collectHydrationErrors = (page: Page) => {
    const errors: string[] = []
    page.on('console', (message) => {
        if (message.type() === 'error' && HYDRATION_ERROR.test(message.text())) errors.push(message.text())
    })
    page.on('pageerror', (error) => {
        if (HYDRATION_ERROR.test(error.message)) errors.push(error.message)
    })
    return errors
}

const inZone = async (
    browser: Browser,
    role: TestingRole,
    timezoneId: string,
    fn: (page: Page, hydrationErrors: string[]) => Promise<void>,
) => {
    const context = await browser.newContext({ storageState: authFileFor(role), timezoneId })
    try {
        const page = await context.newPage()
        await fn(page, collectHydrationErrors(page))
    } finally {
        await context.close()
    }
}

const timeAt = (page: Page, at: Date) => page.locator(`time[datetime="${at.toISOString()}"]`).first()

test.describe('dates in the browser time zone', () => {
    for (const { timezoneId, at } of ZONES) {
        test(`study pages show the local day in ${timezoneId}`, async ({ browser, studyFeatures }) => {
            expect(localDay(at, timezoneId)).not.toBe(localDay(at, 'UTC'))
            const { studyId } = await seedCodeApprovedAt(studyFeatures.uniqueTitle(`local dates ${timezoneId}`), at)
            const day = localDay(at, timezoneId)

            await inZone(browser, 'researcher', timezoneId, async (page, hydrationErrors) => {
                // Outputs step: a server-rendered banner.
                await goto(page, Routes.studyView({ orgSlug: LAB_SLUG, studyId }))
                await expect(timeAt(page, at)).toHaveText(day)

                // Study code step: a client-rendered banner and the submitted code Last activity (OTTER-809).
                await goto(page, Routes.studyViewCode({ orgSlug: LAB_SLUG, studyId }))
                await expect(timeAt(page, at)).toHaveText(day)
                const activity = localParts(new Date(at.getTime() - 60_000), timezoneId)
                await expect(page.getByText(/· Uploaded ·/)).toContainText(
                    `${activity.day}, ${activity.hour}:${activity.minute} ${activity.period.toLowerCase()}`,
                )

                expect(hydrationErrors).toEqual([])
            })

            await inZone(browser, 'reviewer', timezoneId, async (page, hydrationErrors) => {
                // Outputs step: the stage start is older than a day, so it reads as a local date and time.
                await goto(page, Routes.studyReview({ orgSlug: ENCLAVE_SLUG, studyId }))
                const started = localParts(at, timezoneId)
                await expect(page.getByTestId('status-alert')).toContainText(
                    `code approved on ${started.day} at ${Number(started.hour)}:${started.minute} ${started.period}`,
                )

                await goto(page, Routes.studyReviewCode({ orgSlug: ENCLAVE_SLUG, studyId }))
                await expect(timeAt(page, at)).toHaveText(day)

                expect(hydrationErrors).toEqual([])
            })
        })
    }

    test('the Signed on picker stops at the admin’s local day', async ({ browser }) => {
        // A zone where the local day is not the UTC day at `before`. No zone stays that way across
        // UTC midnight, so the zone and its check share one instant instead of two clock reads.
        const before = new Date()
        const timezoneId = before.getUTCHours() >= 10 ? 'Pacific/Kiritimati' : 'Pacific/Pago_Pago'
        const isoDay = (timeZone: string, at: Date) =>
            new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
        expect(isoDay(timezoneId, before)).not.toBe(isoDay('UTC', before))

        await inZone(browser, 'admin', timezoneId, async (page, hydrationErrors) => {
            await goto(page, Routes.adminSafeinsightsLegal)
            await page.getByRole('tab', { name: 'DOPA' }).click()
            await page.getByRole('tabpanel').getByRole('button', { name: 'Upload', exact: true }).click()

            const signedOn = page.getByRole('dialog').getByLabel('Signed on')
            await expect(signedOn).toHaveAttribute('max', /^\d{4}-\d{2}-\d{2}$/)
            const max = await signedOn.getAttribute('max')
            // The browser read its clock somewhere between `before` and now.
            expect([isoDay(timezoneId, before), isoDay(timezoneId, new Date())]).toContain(max)
            expect(hydrationErrors).toEqual([])
        })
    })
})
