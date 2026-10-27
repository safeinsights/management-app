import type { Locator, Page } from '@playwright/test'

// pressSequentially, not page.keyboard.type: the latter goes wherever focus happens to be, so if the
// editor loses focus the keystrokes land on the page — and a space activates whatever button has it.
export async function typeIntoLexical(field: Locator, text: string) {
    await field.click()
    await field.pressSequentially(text)
}

export async function fillLexicalField(page: Page, ariaLabel: string, text: string) {
    await typeIntoLexical(page.locator(`[aria-label="${ariaLabel}"]`), text)
}

// Types `text` into a rich-text field and hyperlinks all of it through the editor
// toolbar. The toolbar is scoped to the field's own editor because a page renders
// one Lexical instance (and one toolbar) per rich-text field.
export async function insertLexicalLink(page: Page, ariaLabel: string, text: string, url: string) {
    const editor = page.locator(`.collaborative-editor-container:has([aria-label="${ariaLabel}"])`)
    await typeIntoLexical(editor.locator(`[aria-label="${ariaLabel}"]`), text)
    await page.keyboard.press('ControlOrMeta+a')

    await editor.getByLabel('Link').click()
    await editor.getByPlaceholder('https://').fill(url)
    await editor.getByLabel('Apply link').click()
}

export const fillPinInput = async (page: Page, pinCode: string, testId: string) => {
    const pin = pinCode.split('')
    // Try to find inputs within the testId element, fallback to direct selection
    let pinInputs = page.getByTestId(testId).locator('input')
    const count = await pinInputs.count()
    if (count === 0) {
        // Fallback: try to find the PinInput group directly
        pinInputs = page.locator('[role="group"]').locator('input[placeholder="0"]')
    }
    for (let i = 0; i < pin.length; i++) {
        await pinInputs.nth(i).fill(pin[i])
    }
}
