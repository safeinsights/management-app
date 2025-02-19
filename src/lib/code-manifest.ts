import type { TreeNode, CodeManifest, SupportedLanguages, CodeManifestFileInfo } from './types'

import type { FileWithPath } from '@mantine/dropzone'

export class CodeReviewManifest {
    files: FileWithPath[] = []

    constructor(
        public jobId: string,
        public language: SupportedLanguages,
    ) {}

    get asTreeNode(): TreeNode {
        const root: TreeNode = {
            label: '',
            value: '',
            size: 0,
            children: [],
        }

        for (const { path, name, size } of this.files) {
            const parts = (path || name).replace(/^\.?\//, '').split('/')
            let currentNode = root
            let value = ''
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i]
                value = value ? `${value}/${part}` : part
                const isFile = i === parts.length - 1
                let existingNode = currentNode.children!.find((child) => child.label === part)

                if (!existingNode) {
                    existingNode = {
                        value,
                        label: part,
                        size: isFile ? size || 0 : 0,
                        children: isFile ? undefined : [],
                    }
                    currentNode.children!.push(existingNode)
                }

                currentNode = existingNode
            }
        }
        return root
    }

    get asJSON() {
        return JSON.stringify(
            {
                language: this.language,
                jobId: this.jobId,
                size: this.files.reduce((acc, f) => acc + f.size, 0),
                tree: this.asTreeNode,
                files: this.files.reduce(
                    (acc, file) => {
                        acc[(file.path || file.name).replace(/^\.?\//, '')] = {
                            size: file.size,
                            contentType: file.type || 'application/octet-stream',
                        }
                        return acc
                    },
                    {} as { [key: string]: CodeManifestFileInfo },
                ),
            } satisfies CodeManifest,
            null,
            4,
        )
    }
}
