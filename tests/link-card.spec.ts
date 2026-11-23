import type { Locator, Page } from '@playwright/test'
import { expect, insertLexicalLink, test, withRole } from './e2e.helpers'
import * as study from './study.helpers'

// OTTER-992: under load the next field gets focus before the editor has finished closing the card.
// The close and the focus move share one task here, so every run meets that order.
async function openNotesLinkCard(page: Page, title: string) {
    await study.navigateToProposeStudy(page, title)
    await insertLexicalLink(page, 'Additional notes or requests', study.PROPOSAL_LINK_TEXT, study.PROPOSAL_LINK_URL)
    await page.locator(`a[href="${study.PROPOSAL_LINK_URL}"]`).click()

    const card = page.getByRole('dialog', { name: 'Link details' })
    await expect(card.getByRole('button', { name: 'Copy link' })).toBeFocused()
    return card
}

// Deferred editor work lands within the next frames, so focus is read after them.
async function expectFocusKept(page: Page, field: Locator) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(field).toBeFocused()
}

test('a focus move right after Escape on a link card stays on the new field', async ({ browser, studyFeatures }) => {
    await withRole(browser, 'researcher', async (page) => {
        const card = await openNotesLinkCard(page, studyFeatures.uniqueTitle('link-card-escape'))
        const piField = page.getByRole('combobox', { name: 'Principal Investigator' })

        await piField.evaluate((field) => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
            )
            field.focus()
        })

        await expect(card).toBeHidden()
        await expectFocusKept(page, piField)
    })
})

test('a focus move right after Remove link stays on the new field', async ({ browser, studyFeatures }) => {
    await withRole(browser, 'researcher', async (page) => {
        const card = await openNotesLinkCard(page, studyFeatures.uniqueTitle('link-card-remove'))
        const piField = page.getByRole('combobox', { name: 'Principal Investigator' })
        const removeButton = card.getByRole('button', { name: 'Remove link' })

        await removeButton.evaluate(
            (button, field) => {
                if (!(button instanceof HTMLElement)) throw new Error('Remove link is not an HTML button')
                button.click()
                field?.focus()
            },
            await piField.elementHandle(),
        )

        await expect(page.locator(`a[href="${study.PROPOSAL_LINK_URL}"]`)).toHaveCount(0)
        await expectFocusKept(page, piField)
    })
})
