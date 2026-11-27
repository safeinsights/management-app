import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { Routes } from '@/lib/routes'
import type { PendingGlobalAcknowledgement } from '@/schema/legal-document'
import { GlobalAcknowledgement } from './global-acknowledgement'

const pending = (type: 'TOS' | 'PN', isUpdate = true): PendingGlobalAcknowledgement => ({
    type,
    versionId: `${type}-version`,
    isUpdate,
})

const TOS = pending('TOS')
const PN = pending('PN')

const renderGate = (documents: PendingGlobalAcknowledgement[], overrides: { isChecked?: boolean } = {}) => {
    const onCheckedChange = vi.fn()
    const onContinue = vi.fn()
    renderWithProviders(
        <GlobalAcknowledgement
            documents={documents}
            isChecked={overrides.isChecked ?? false}
            onCheckedChange={onCheckedChange}
            onContinue={onContinue}
            isSubmitting={false}
            error={null}
        />,
    )
    // What a sighted reader sees: the links' screen-reader note is covered on its own.
    const visibleText = () =>
        screen.getByRole('heading').closest('.mantine-Paper-root')?.textContent?.replaceAll(' (opens in a new tab)', '')
    return { onCheckedChange, onContinue, visibleText }
}

describe('GlobalAcknowledgement', () => {
    it('welcomes the user under a single heading', () => {
        renderGate([TOS])

        expect(screen.getByRole('heading', { level: 1, name: 'Welcome to SafeInsights!' })).toBeDefined()
        expect(screen.getAllByRole('heading')).toHaveLength(1)
    })

    it('centres the heading', () => {
        renderGate([TOS])

        expect(screen.getByRole('heading', { name: 'Welcome to SafeInsights!' })).toHaveStyle({ textAlign: 'center' })
    })

    it.each([
        {
            documents: [TOS],
            body: 'We have updated our Terms of Service. Please review before proceeding.',
            label: 'I have read and agree to the updated Terms of Service.',
        },
        {
            documents: [PN],
            body: 'We have updated our Privacy Notice. Please review before proceeding.',
            label: 'I have read and agree to the updated Privacy Notice.',
        },
        {
            documents: [TOS, PN],
            body: 'We have updated our Terms of Service and Privacy Notice. Please review before proceeding.',
            label: 'I have read and agree to the updated Terms of Service and Privacy Notice.',
        },
        {
            documents: [pending('TOS', false)],
            body: 'The Terms of Service is now available. Please review before proceeding.',
            label: 'I have read and agree to the Terms of Service.',
        },
        {
            documents: [pending('TOS', false), PN],
            body: 'The Terms of Service and Privacy Notice are now available. Please review before proceeding.',
            label: 'I have read and agree to the Terms of Service and Privacy Notice.',
        },
    ])('says "$body"', ({ documents, body, label }) => {
        const { visibleText } = renderGate(documents)

        expect(visibleText()).toContain(body)
        expect(screen.getByRole('checkbox', { name: label })).toBeDefined()
    })

    it('links each document to its public page in a new browser tab', () => {
        renderGate([TOS, PN])

        const tos = screen.getByRole('link', { name: /^Terms of Service/ })
        expect(tos.getAttribute('href')).toBe(Routes.termsOfService)
        expect(tos.getAttribute('target')).toBe('_blank')

        const pn = screen.getByRole('link', { name: /^Privacy Notice/ })
        expect(pn.getAttribute('href')).toBe(Routes.privacyNotice)
        expect(pn.getAttribute('target')).toBe('_blank')
    })

    // Nothing but the heading, one sentence, the checkbox and the button: the document is a link away.
    it('links to the document rather than embedding it', () => {
        const { visibleText } = renderGate([TOS])

        expect(visibleText()).toBe(
            'Welcome to SafeInsights!' +
                'We have updated our Terms of Service. Please review before proceeding.' +
                'I have read and agree to the updated Terms of Service.' +
                'Continue',
        )
    })

    it('tells a screen reader the link opens a new tab', () => {
        renderGate([TOS])

        expect(screen.getByRole('link', { name: 'Terms of Service (opens in a new tab)' })).toBeDefined()
    })

    it('holds Continue until the box is ticked, and offers no Sign out', async () => {
        const { onCheckedChange } = renderGate([TOS])

        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
        expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()

        await userEvent.click(screen.getByRole('checkbox'))
        expect(onCheckedChange).toHaveBeenCalledWith(true)
    })

    it('continues once ticked', async () => {
        const { onContinue } = renderGate([TOS, PN], { isChecked: true })

        await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

        expect(onContinue).toHaveBeenCalledOnce()
    })
})
