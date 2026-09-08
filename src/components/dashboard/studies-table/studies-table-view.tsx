'use client'

import type { ReactNode } from 'react'
import type { Route } from 'next'
import { Divider, Flex, Group, Paper, Stack, Table, TableTbody, Text, Title } from '@mantine/core'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import { ErrorAlert } from '@/components/errors'
import { RefresherSlot } from '@/components/refresher'
import { TableHeader } from './columns'
import { EmptyState } from './empty-state'
import { Audience, Scope, StudyRow as StudyRowType } from './types'

// Rows come via `renderRow` so the session-dependent action link stays in the container.
export type StudiesTableViewProps = {
    studies: StudyRowType[]
    audience: Audience
    scope: Scope
    title?: string
    description?: string
    newStudyHref?: Route
    headerActions?: ReactNode
    refresher?: ReactNode
    isError?: boolean
    errorMessage?: string
    paperWrapper?: boolean
    renderRow: (study: StudyRowType) => ReactNode
}

export function StudiesTableView({
    studies,
    audience,
    scope,
    title,
    description,
    newStudyHref,
    headerActions,
    refresher,
    isError = false,
    errorMessage = '',
    paperWrapper = false,
    renderRow,
}: StudiesTableViewProps) {
    let body: ReactNode
    if (isError) {
        body = <ErrorAlert error={`Failed to load studies: ${errorMessage}`} />
    } else if (studies.length === 0) {
        body = <EmptyState audience={audience} scope={scope} />
    } else {
        body = (
            <Table layout="fixed" verticalSpacing="md" highlightOnHover stickyHeader>
                <TableHeader audience={audience} scope={scope} />
                <TableTbody>{studies.map(renderRow)}</TableTbody>
            </Table>
        )
    }

    // The header always renders so dual-role users keep their audience toggle when the selected
    // role has no studies.
    const content = (
        <Stack>
            <Group justify="space-between" align="center">
                {title && <Title order={3}>{title}</Title>}
                <Flex justify="flex-end" align="center" gap="md">
                    {headerActions}
                    {newStudyHref && (
                        <ButtonLink leftSection={<PlusIcon />} data-testid="new-study" href={newStudyHref}>
                            Propose New Study
                        </ButtonLink>
                    )}
                </Flex>
            </Group>
            <Divider c="charcoal.1" />
            {description && <Text mb="md">{description}</Text>}
            <RefresherSlot>{refresher}</RefresherSlot>
            {body}
        </Stack>
    )

    if (paperWrapper) {
        return (
            <Paper shadow="xs" p="xxl">
                {content}
            </Paper>
        )
    }

    return content
}
