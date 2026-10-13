import { $dfs, $findMatchingParent } from '@lexical/utils'
import { $isLinkNode, type LinkAttributes, type LinkNode } from '@lexical/link'
import {
    $createRangeSelection,
    $createRangeSelectionFromDom,
    $createTextNode,
    $getNearestNodeFromDOMNode,
    $getNodeByKey,
    $getSelection,
    $isElementNode,
    $isLineBreakNode,
    $isRangeSelection,
    $isTextNode,
    $setSelection,
    createCommand,
    type BaseSelection,
    type LexicalCommand,
    type LexicalEditor,
    type LexicalNode,
    type PointType,
    type TextNode,
} from 'lexical'

/** Dispatched by the toolbar so the card can open for the link the caret already sits in. */
export const OPEN_LINK_CARD_COMMAND: LexicalCommand<void> = createCommand('OPEN_LINK_CARD_COMMAND')

export interface LinkCardTarget {
    nodeKey: string
    /** Sanitized by the node, so a stored URL with an unsupported protocol reads as `about:blank`. */
    url: string
    target: string | null
    text: string
}

function describeLink(link: LinkNode): LinkCardTarget {
    return {
        nodeKey: link.getKey(),
        url: link.sanitizeUrl(link.getURL()),
        target: link.getTarget(),
        text: link.getTextContent(),
    }
}

function $linkNodeAtDomNode(domNode: Node): LinkNode | null {
    const node = $getNearestNodeFromDOMNode(domNode)
    return node && $findMatchingParent(node, $isLinkNode)
}

export function $linkAtDomNode(domNode: Node): LinkCardTarget | null {
    const link = $linkNodeAtDomNode(domNode)
    return link ? describeLink(link) : null
}

/** A caret on a link's end belongs to it, but Lexical moves that caret onto the start of the next text. */
function $linkAtPoint(point: PointType): LinkNode | null {
    const node = point.getNode()
    const link = $findMatchingParent(node, $isLinkNode)
    if (link || point.type !== 'text' || point.offset !== 0) return link

    const previous = node.getPreviousSibling()
    return $isLinkNode(previous) ? previous : null
}

function $selectedLink(selection: BaseSelection | null): LinkNode | null {
    if (!$isRangeSelection(selection)) return null

    const link = $linkAtPoint(selection.anchor)
    // A selection spanning out of the link is a text range, not a link the card can act on.
    return link?.is($linkAtPoint(selection.focus)) ? link : null
}

/**
 * True only once the caret has moved out of the link. A missing range selection means the editor is
 * blurred, which is the state while the card itself holds focus.
 */
export function $selectionLeftLink(nodeKey: string): boolean {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return false

    return $linkAtPoint(selection.anchor)?.getKey() !== nodeKey
}

export function $updateLink(nodeKey: string, url: string, text: string, attributes: LinkAttributes) {
    const link = $getNodeByKey(nodeKey)
    if (!$isLinkNode(link)) return

    link.setURL(url)
    // Links stored before OTTER-463 carry no target, so saving one brings it up to date.
    link.setTarget(attributes.target ?? null)
    link.setRel(attributes.rel ?? null)

    if (!text || link.getTextContent() === text) return

    const [firstChild, ...rest] = link.getChildren()
    if (rest.length === 0 && $isTextNode(firstChild)) {
        firstChild.setTextContent(text)
        return
    }

    link.clear()
    link.append($createTextNode(text))
}

/** Lifts the link's children out and drops the link, leaving the text where it was. */
export function $unwrapLink(nodeKey: string) {
    const link = $getNodeByKey(nodeKey)
    if (!$isLinkNode(link)) return

    const children = link.getChildren()
    for (const child of children) link.insertBefore(child)
    link.remove()

    const last = children.at(-1)
    if ($isTextNode(last)) last.select(last.getTextContentSize(), last.getTextContentSize())
}

/** Offsets into the link's text, which outlive the card's Edit replacing the link's text nodes. */
export interface LinkCaret {
    anchor: number
    focus: number
}

/** The link the card opens for, and the caret to put back when it closes. */
export interface LinkCardOpening {
    link: LinkCardTarget
    caret: LinkCaret | null
}

/** Text and line breaks in order: the units every offset into the link counts. */
function $linkLeaves(link: LinkNode): LexicalNode[] {
    return $dfs(link)
        .map(({ node }) => node)
        .filter((node) => $isTextNode(node) || $isLineBreakNode(node))
}

/** An element point as the leaf it sits before or after, so it counts in the same units as a text point. */
function $leafPoint(point: PointType): { leaf: LexicalNode; offset: number } {
    const node = point.getNode()
    if (point.type === 'text' || !$isElementNode(node)) return { leaf: node, offset: point.offset }

    const child = node.getChildAtIndex(point.offset)
    if (child) return { leaf: $isElementNode(child) ? (child.getFirstDescendant() ?? child) : child, offset: 0 }

    const last = node.getLastDescendant() ?? node
    return { leaf: last, offset: last.getTextContentSize() }
}

function $touchesLink(link: LinkNode, point: PointType): boolean {
    const { leaf, offset } = $leafPoint(point)
    if (link.isParentOf(leaf)) return true
    if (offset === 0) return link.is(leaf.getPreviousSibling())
    return offset === leaf.getTextContentSize() && link.is(leaf.getNextSibling())
}

function $offsetInLink(link: LinkNode, point: PointType): number {
    const { leaf, offset } = $leafPoint(point)
    let before = 0
    for (const node of $linkLeaves(link)) {
        if (node.is(leaf)) return before + offset
        before += node.getTextContentSize()
    }
    return leaf.isBefore(link) ? 0 : before
}

/** Null unless both ends are in the link or on its edge, since a caret elsewhere says nothing about it. */
function $caretInLink(link: LinkNode, selection: BaseSelection | null): LinkCaret | null {
    if (!$isRangeSelection(selection)) return null
    if (!$touchesLink(link, selection.anchor) || !$touchesLink(link, selection.focus)) return null

    return { anchor: $offsetInLink(link, selection.anchor), focus: $offsetInLink(link, selection.focus) }
}

export function $openLinkAtSelection(): LinkCardOpening | null {
    const selection = $getSelection()
    const link = $selectedLink(selection)
    return link && { link: describeLink(link), caret: $caretInLink(link, selection) }
}

export function $openLinkAtDomNode(domNode: Node, editor: LexicalEditor): LinkCardOpening | null {
    const link = $linkNodeAtDomNode(domNode)
    if (!link) return null

    // The DOM caret, because the browser moved it on mousedown and the selectionchange that tells
    // Lexical may not have run yet.
    const clicked = $createRangeSelectionFromDom(window.getSelection(), editor)
    return { link: describeLink(link), caret: $caretInLink(link, clicked) }
}

function $textPointAt(link: LinkNode, offset: number): { node: TextNode; offset: number } | null {
    let before = 0
    for (const leaf of $linkLeaves(link)) {
        const size = leaf.getTextContentSize()
        if ($isTextNode(leaf) && offset <= before + size) return { node: leaf, offset: Math.max(offset - before, 0) }
        before += size
    }
    return null
}

/** Puts the caret back where it was when the card opened, or on the link's end when that is unknown. */
export function $restoreLinkCaret(nodeKey: string, caret: LinkCaret | null) {
    const link = $getNodeByKey(nodeKey)
    if (!$isLinkNode(link)) return

    // Edit may have shortened the text since the card opened.
    const size = $linkLeaves(link).reduce((total, leaf) => total + leaf.getTextContentSize(), 0)
    const anchor = $textPointAt(link, Math.min(caret?.anchor ?? size, size))
    const focus = $textPointAt(link, Math.min(caret?.focus ?? size, size))
    if (!anchor || !focus) {
        link.selectEnd()
        return
    }

    const selection = $createRangeSelection()
    selection.anchor.set(anchor.node.getKey(), anchor.offset, 'text')
    selection.focus.set(focus.node.getKey(), focus.offset, 'text')
    // A new selection types unformatted text, and the browser's caret read that would correct it
    // skips a caret in the middle of a text node.
    selection.setFormat(anchor.node.getFormat())
    selection.setStyle(anchor.node.getStyle())
    $setSelection(selection)
}
