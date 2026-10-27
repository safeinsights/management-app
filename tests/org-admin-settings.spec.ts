import { authFileFor, expect, goto, reload, test, withRole } from './e2e.helpers'
import { seedCodeEnv, seedOrg } from './e2e.seed'

// Org settings, driven on a freshly seeded Data Partner the reviewer administers: these tests
// rename, delete and designate, which must never touch the fixture orgs other workers share.

test.use({ storageState: authFileFor('reviewer') })

test('Org admin edits the organization description', { tag: '@admin' }, async ({ page }) => {
    const org = await seedOrg({ type: 'enclave', adminRoles: ['reviewer'] })
    const renamed = `${org.name} Renamed`
    const description = 'Described by the end-to-end suite.'

    await goto(page, `/${org.slug}/admin/settings`)
    await expect(page.getByRole('heading', { name: 'About organization' })).toBeVisible()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(renamed)
    await page.getByRole('textbox', { name: 'Description', exact: true }).fill(description)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Organization settings updated successfully.')).toBeVisible()

    // The display reads the page's org prop, so the reload is what proves the write.
    await reload(page)
    await expect(page.getByText(renamed).first()).toBeVisible()
    await expect(page.getByText(description)).toBeVisible()
})

test('Org admin manages data sources', { tag: '@admin' }, async ({ page }) => {
    const org = await seedOrg({ type: 'enclave', adminRoles: ['reviewer'] })
    const name = `Activity Logs ${Date.now().toString(36)}`
    const renamed = `${name} Renamed`
    // Rows have no role: the innermost box holding both the name and the row's control is the row.
    const rowWith = (text: string, control: string) =>
        page
            .locator('div')
            .filter({ hasText: text })
            .filter({ has: page.getByRole('button', { name: control }) })
            .last()

    await goto(page, `/${org.slug}/admin/settings`)
    await page.getByRole('button', { name: 'Add Data Source' }).click()
    const addDialog = page.getByRole('dialog', { name: 'Add Data Source' })
    await addDialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
    await addDialog.getByRole('textbox', { name: 'Description', exact: true }).fill('Per-session activity logs.')
    await addDialog.getByRole('textbox', { name: 'New URL', exact: true }).fill('https://example.com/logs')
    await addDialog.getByRole('textbox', { name: 'New URL description', exact: true }).fill('Schema documentation')
    await addDialog.getByRole('button', { name: 'Add URL' }).click()
    await addDialog.getByRole('button', { name: 'Save Data Source' }).click()
    await expect(page.getByText('Data source added successfully')).toBeVisible()
    await expect(rowWith(name, 'Edit data source')).toContainText('Per-session activity logs.')
    await expect(rowWith(name, 'Edit data source').getByRole('link').first()).toHaveAttribute(
        'href',
        'https://example.com/logs',
    )

    await rowWith(name, 'Edit data source').getByRole('button', { name: 'Edit data source' }).click()
    const editDialog = page.getByRole('dialog', { name: 'Edit Data Source' })
    await editDialog.getByRole('textbox', { name: 'Name', exact: true }).fill(renamed)
    await editDialog.getByRole('button', { name: 'Update Data Source' }).click()
    await expect(page.getByText('Data source updated successfully')).toBeVisible()
    await expect(page.getByText(renamed)).toBeVisible()

    await rowWith(renamed, 'Delete data source').getByRole('button', { name: 'Delete data source' }).click()
    await expect(
        page.getByText('Are you sure you want to delete this data source? This cannot be undone.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(page.getByText('Data source was deleted successfully')).toBeVisible()
    await expect(page.getByText(renamed)).toHaveCount(0)
})

test('Org admin deletes a code environment while the last one stays', { tag: '@admin' }, async ({ page }) => {
    const org = await seedOrg({ type: 'enclave', adminRoles: ['reviewer'] })
    const suffix = Date.now().toString(36)
    const keep = await seedCodeEnv({
        orgSlug: org.slug,
        name: `Keep ${suffix}`,
        identifier: `keep_${suffix}`,
        scanStatus: 'SCAN-COMPLETE',
    })
    const spare = await seedCodeEnv({
        orgSlug: org.slug,
        name: `Spare ${suffix}`,
        identifier: `spare_${suffix}`,
        scanStatus: 'SCAN-COMPLETE',
    })

    await goto(page, `/${org.slug}/admin/settings`)
    await page.getByRole('button', { name: `Delete ${spare.name}`, exact: true }).click()
    await expect(
        page.getByText('Are you sure you want to delete this code environment? This cannot be undone.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(page.getByText('Code environment was deleted successfully')).toBeVisible()
    await expect(page.getByRole('button', { name: `Details for ${spare.name}`, exact: true })).toHaveCount(0)

    // The last non-testing environment of a language cannot go: its delete control is withheld.
    await expect(page.getByRole('button', { name: `Details for ${keep.name}`, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: `Delete ${keep.name}`, exact: true })).toHaveCount(0)
})

test('Org admin designates a test lab and an SI admin drops it', { tag: '@admin' }, async ({ browser, page }) => {
    const enclave = await seedOrg({ type: 'enclave', adminRoles: ['reviewer'] })
    const lab = await seedOrg({ type: 'lab' })

    await goto(page, `/${enclave.slug}/admin/settings`)
    await expect(page.getByRole('heading', { name: 'Test Labs' })).toBeVisible()
    await page.getByRole('button', { name: 'Add Test Lab' }).click()
    const dialog = page.getByRole('dialog', { name: 'Select Research Labs to add as Test Labs' })
    await dialog.getByRole('textbox', { name: 'Research Labs' }).fill(lab.name)
    await page.getByRole('option', { name: lab.name, exact: true }).click()
    // Settle the dropdown on the dialog's own title before reaching for the footer.
    await dialog.getByText('Select Research Labs to add as Test Labs').click()
    await dialog.getByRole('button', { name: 'Add as Test Lab', exact: true }).click()
    await expect(dialog.getByText('Add these labs as Test Labs?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Add as Test Lab', exact: true }).click()
    await expect(page.getByText('Test labs were added successfully')).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: lab.name })).toBeVisible()

    // Undesignating is SI-admin only and kept behind the spy-mode toggle in the page corner.
    await withRole(browser, 'admin', async (adminPage) => {
        await goto(adminPage, `/${enclave.slug}/admin/settings`)
        await expect(adminPage.getByRole('row').filter({ hasText: lab.name })).toBeVisible()
        await adminPage.locator('.pi-symbol').click()
        await adminPage.getByLabel(`Drop ${lab.name}`, { exact: true }).click()
        await expect(adminPage.getByText(/Drop this test lab\?/)).toBeVisible()
        await adminPage.getByRole('button', { name: 'Yes', exact: true }).click()
        await expect(adminPage.getByText('Test lab was dropped')).toBeVisible()
        await expect(adminPage.getByRole('row').filter({ hasText: lab.name })).toHaveCount(0)
    })
})
