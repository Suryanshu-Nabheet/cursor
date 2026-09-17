/**
 * Codicon — VS Code icon component
 * Uses @vscode/codicons font — identical icons to VS Code itself.
 *
 * Usage:
 *   <Codicon name="sparkle" />
 *   <Codicon name="gear" className="spinning" />
 *   <Codicon name="close" style={{ fontSize: 14 }} />
 *
 * Full icon list: https://microsoft.github.io/vscode-codicons/dist/codicon.html
 */
import React from 'react'
import '@vscode/codicons/dist/codicon.css'

interface CodiconProps {
    name: string
    className?: string
    style?: React.CSSProperties
    title?: string
    spin?: boolean
    onClick?: (e: React.MouseEvent) => void
}

export function Codicon({
    name,
    className = '',
    style,
    title,
    spin,
    onClick,
}: CodiconProps) {
    const spinClass = spin ? ' codicon-modifier-spin' : ''
    return (
        <i
            className={`codicon codicon-${name}${spinClass}${
                className ? ' ' + className : ''
            }`}
            style={style}
            title={title}
            aria-hidden="true"
            onClick={onClick}
        />
    )
}

export default Codicon
