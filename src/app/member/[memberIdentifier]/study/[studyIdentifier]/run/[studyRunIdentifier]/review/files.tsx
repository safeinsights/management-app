'use client'

import {
    IconBrandJavascript,
    IconFolder,
    IconFolderOpen,
    IconListTree,
    IconCircleLetterRFilled,
    IconDiamond,
    IconFileText,
    IconBrandPython,
    IconMarkdown,
} from '@tabler/icons-react'
import { ActionIcon, Group, RenderTreeNodePayload, Tree, useTree } from '@mantine/core'
import { Flex } from '@mantine/core'

import { CssIcon, NpmIcon, TypeScriptCircleIcon } from '@mantinex/dev-icons'

import type { MinimalRunInfo, CodeManifest, TreeNode } from '@/lib/types'
import { DisplayFile } from './display'
import { expandIconStyle, leftPanelStyles, treeStyles } from './styles.css'
import { ReactNode } from 'react'

interface FileIconProps {
    name: string
    isFolder: boolean
    expanded: boolean
}

const Icons: [RegExp, ReactNode][] = [
    [/\.(ts|tsx|tsconfig(\.json)?)$/, <TypeScriptCircleIcon key="ts" size={14} />],
    [/\.(css|scss|sass)$/, <CssIcon size={14} key="css" />],
    [/\.(js|jsx)$/, <IconBrandJavascript size={14} key="js" />],
    [/\.r$/i, <IconCircleLetterRFilled size={14} key="j" />],
    [/package\.json$/, <NpmIcon size={14} key="npm" />],
    [/\.rb$/i, <IconDiamond color="red" size={14} key="ruby" />],
    [/\.txt$/i, <IconFileText size={14} key="txt" />],
    [/\.md$/i, <IconMarkdown size={14} key="md" />],
    [/\.py$/i, <IconBrandPython size={14} key="py" />],
]

function FileIcon({ name, isFolder, expanded }: FileIconProps) {
    if (isFolder) {
        return expanded ? (
            <IconFolderOpen color="var(--mantine-color-yellow-9)" size={14} stroke={2.5} />
        ) : (
            <IconFolder color="var(--mantine-color-yellow-9)" size={14} stroke={2.5} />
        )
    }

    return Icons.find(([re]) => re.test(name))?.[1] || null
}

function Leaf({ node, expanded, hasChildren, elementProps }: RenderTreeNodePayload) {
    return (
        <Group gap={5} {...elementProps}>
            <FileIcon name={node.value} isFolder={hasChildren} expanded={expanded} />
            <span>{node.label}</span>
        </Group>
    )
}

export function Files({
    data,
    runInfo,
    manifest,
    initialExpanded,
}: {
    initialExpanded?: string
    data: TreeNode[]
    runInfo: MinimalRunInfo
    manifest: CodeManifest
}) {
    const tree = useTree({
        initialExpandedState: initialExpanded ? { [`${initialExpanded}`]: true } : undefined,
    })

    return (
        <Flex gap="md">
            <Flex className={leftPanelStyles} direction="column" px="sm">
                <ActionIcon className={expandIconStyle} title="Expand All" onClick={() => tree.expandAllNodes()}>
                    <IconListTree />
                </ActionIcon>
                <Tree
                    className={treeStyles}
                    selectOnClick
                    clearSelectionOnOutsideClick
                    data={data}
                    tree={tree}
                    renderNode={(payload) => <Leaf {...payload} />}
                />
            </Flex>
            <DisplayFile path={tree.selectedState[0]} runInfo={runInfo} manifest={manifest} />
        </Flex>
    )
}
