import { authFileFor, expect, goto, readTestSupportFile, reload, test } from './e2e.helpers'

// The SI admin's organization table and the AI assistant's context, on /admin/safeinsights.
// Only the SI admin can open it; orgs created here are the test's own and are deleted again.

test.use({ storageState: authFileFor('admin') })

test('SI admin creates, edits and deletes an organization', { tag: '@admin' }, async ({ page }) => {
    const suffix = Date.now().toString(36)
    const slug = `e2e-ui-org-${suffix}`
    const name = `E2E UI Org ${suffix}`
    const row = () => page.getByRole('row').filter({ hasText: slug })

    await goto(page, '/admin/safeinsights')
    await expect(page.getByRole('heading', { name: 'Organizations', level: 1 })).toBeVisible()

    // The table's own refetch can re-render the button under the click, so retry until the modal opens.
    const addDialog = page.getByRole('dialog', { name: 'Add organization' })
    await expect(async () => {
        await page.getByRole('button', { name: 'Add new organization' }).click()
        await expect(addDialog).toBeVisible()
    }).toPass()
    await addDialog.getByRole('textbox', { name: 'Slug', exact: true }).fill(slug)
    await addDialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
    await addDialog.getByRole('textbox', { name: 'Email', exact: true }).fill(`${slug}@example.com`)
    // An enclave needs the key its enclave signs job-API tokens with.
    await addDialog
        .getByRole('textbox', { name: 'Public Key', exact: true })
        .fill(await readTestSupportFile('public_key.pem'))
    await addDialog.getByRole('button', { name: 'Submit' }).click()
    await expect(addDialog).toBeHidden()
    // No toast: the refetched table is the confirmation.
    await expect(row()).toBeVisible()
    await expect(row()).toContainText(name)

    const renamed = `${name} Renamed`
    await row().getByLabel(`Edit ${name}`, { exact: true }).click()
    const editDialog = page.getByRole('dialog', { name: `Edit ${name}` })
    await expect(editDialog.getByRole('textbox', { name: 'Slug', exact: true })).toBeDisabled()
    await editDialog.getByRole('textbox', { name: 'Name', exact: true }).fill(renamed)
    await editDialog.getByRole('button', { name: 'Submit' }).click()
    await expect(editDialog).toBeHidden()
    await expect(row()).toContainText(renamed)

    // The row links out to the org's own admin pages.
    await row().getByLabel(`Settings for ${renamed}`, { exact: true }).click()
    await page.waitForURL(`/${slug}/admin/settings`)
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    await goto(page, '/admin/safeinsights')
    await row().getByLabel(`View users for ${renamed}`, { exact: true }).click()
    await page.waitForURL(`/${slug}/admin/team`)
    await expect(page.getByRole('heading', { name: 'Manage team', exact: true })).toBeVisible()
    await goto(page, '/admin/safeinsights')

    await row().getByLabel(`Delete ${renamed}`, { exact: true }).click()
    await expect(page.getByText('Are you sure? This cannot be undone.')).toBeVisible()
    await page.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(row()).toHaveCount(0)
})

const CONTEXT_LABELS = ['System context', 'R context', 'Python context'] as const

// The three editors are the global rows of agent_context; the values are unique per run.
test('SI admin saves the AI assistant context', { tag: '@admin' }, async ({ page }) => {
    const stamp = Date.now().toString(36)
    const valueFor = (label: string) => `${label} written by the e2e suite ${stamp}`

    await goto(page, '/admin/safeinsights')
    for (const label of CONTEXT_LABELS) {
        // Three forms, three "Submit" buttons: scope to the form that owns the textarea.
        const form = page.locator('form', { has: page.getByLabel(label, { exact: true }) })
        await form.getByLabel(label, { exact: true }).fill(valueFor(label))
        await form.getByRole('button', { name: 'Submit' }).click()
        await expect(page.getByText(`Updated ${label}.`)).toBeVisible()
    }

    await reload(page)
    for (const label of CONTEXT_LABELS) {
        await expect(page.getByLabel(label, { exact: true })).toHaveValue(valueFor(label))
    }
})
