import { visitClerkProtectedPage, test, expect, Role } from './e2e.helpers'

test.describe('BMA member review', () => {
    const studyTitle = `E2E Member review - ${ [...Array(6)].map(() => Math.floor(Math.random() * 16).toString(16)).join('') }`
    const investigator = 'Principal Investigator'
    const studyDescription = 'A more complete study description'
    const mainR = 'tests/fixtures/temp/main.r'
    const codeLine = 'print("Hello, Tester")'

    test.beforeEach(async ({ page }) => {
        await visitClerkProtectedPage({ page, role: Role.Researcher, url: '/' })
        await expect(page).toHaveTitle(/SafeInsights/)
        await page.getByRole('button', { name: /propose/i }).click()
        await page.getByLabel(/title/i).fill(studyTitle)
        await page.getByLabel(/investigator/i).fill(investigator)
        await page.getByLabel(/description/i).fill(studyDescription)
        await page.getByRole('button', { name: /submit/i }).click()
        await expect(page.getByText(/containerize and upload/i)).toBeVisible()
        await page.setInputFiles('input[type="file"]', mainR)
        await page.getByRole('button', { name: /next/i }).click()
        await page.getByLabel(/highlights and notes/i).check()
        await page.getByRole('button', { name: /submit proposal/i }).click()
        await page.getByRole('button', { name: /back to all studies/i }).click()
        await expect(page.getByRole('list')).toContainText(studyTitle)
        await page.getByLabel(/open user button/i).click()
        await page.getByRole('menuitem', { name: /sign out/i }).click()
        await page.getByRole('banner').getByRole('link').click()
        await expect(page).toHaveTitle(/SafeInsights/)
    })

    test('member reviews a study', async ({ page }) => {
        await visitClerkProtectedPage({ page, role: Role.Member, url: '/' })
        await page.getByRole('button', { name: /review studies/i }).click()
        await page.locator('li').filter({ hasText: studyTitle }).getByRole('link').click()
        await page.getByRole('button', { name: /researcher code/i }).click()
        await page.getByRole('button', { name: /view code/i }).click()
        await page.getByText(/main.r/i).click()
        await expect(page.getByRole('code')).toContainText(codeLine)
    })

    test.afterEach(async ({ page }) => {
        await page.waitForLoadState('networkidle')
    })
})
