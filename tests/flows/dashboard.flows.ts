// Shared page flows (dashboards and study rows): plain functions that take a `page`. They are tier-agnostic by
// rule (eslint.config.mjs): no database, no server modules, no environment, so the hermetic suite and
// the deployed suite drive the same screens the same way. Moved verbatim out of tests/study-flow.spec.ts;
// every submit-shaped flow is still driven live by exactly ONE owning test per tier, and every other
// test reaches that state through seeding.

import { expect, type Page } from '@playwright/test'
import { goto } from './page'

export const RESEARCHER_DASHBOARD = '/openstax-lab/dashboard'
export const REVIEWER_DASHBOARD = '/openstax/dashboard'

// The study title is the row's only link (OTTER-617).
export async function clickViewLink(page: Page, studyRow: ReturnType<Page['getByRole']>) {
    await expect(studyRow).toBeVisible()
    // React Query refetches can detach DOM nodes mid-click, so re-locate each attempt.
    await expect(async () => {
        await studyRow.getByRole('link').first().click()
    }).toPass()
}

export async function viewStudyDetails(page: Page, studyTitle: string) {
    // Exclude only the top-level "Proposal draft" pill (case-sensitive) — `hasNotText`
    // is case-insensitive and would also drop intermediate states like "Code draft".
    const studyRow = page
        .getByRole('row')
        .filter({ hasText: studyTitle })
        .filter({ hasNotText: /Proposal draft/ })
    await clickViewLink(page, studyRow)
    await page.waitForURL(/\/study\//)
}

export const openStudy = async (page: Page, studyTitle: string, dashboard = RESEARCHER_DASHBOARD) => {
    await goto(page, dashboard)
    const studyRow = page
        .getByRole('row')
        .filter({ hasText: studyTitle })
        .filter({ hasNotText: /Proposal draft/ })
    await expect(studyRow).toBeVisible()
    // React Query refetches can detach DOM nodes mid-click, so re-locate each attempt.
    await expect(async () => {
        await studyRow.getByRole('link').first().click()
    }).toPass()
    await page.waitForURL(/\/study\//)
}
