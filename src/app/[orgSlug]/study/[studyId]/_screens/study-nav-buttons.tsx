'use client'

import { Button, Group } from '@mantine/core'
import { ButtonLink } from '@/components/links'
import type { Route } from 'next'
import type { ButtonDescriptor, ScreenIntent } from '@/lib/study-screen'

type Props = { back?: ButtonDescriptor; forward?: ButtonDescriptor; onIntent: (intent: ScreenIntent) => void }

function NavButton({
    button,
    variant,
    onIntent,
}: {
    button: ButtonDescriptor
    variant: 'default' | 'primary'
    onIntent: (intent: ScreenIntent) => void
}) {
    if (button.target.kind === 'route') {
        return (
            <ButtonLink href={button.target.href as Route} variant={variant} size="md">
                {button.title}
            </ButtonLink>
        )
    }
    const intent = button.target.intent
    return (
        <Button variant={variant} size="md" onClick={() => onIntent(intent)}>
            {button.title}
        </Button>
    )
}

export function StudyNavButtons({ back, forward, onIntent }: Props) {
    if (!back && !forward) return null
    return (
        <Group justify="space-between" mt="xxl">
            {back ? <NavButton button={back} variant="default" onIntent={onIntent} /> : <span />}
            {forward ? <NavButton button={forward} variant="primary" onIntent={onIntent} /> : <span />}
        </Group>
    )
}
