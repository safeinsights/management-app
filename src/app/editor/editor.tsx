"use client";

import MonocoReact from '@monaco-editor/react'

export function Editor() {
  return <MonocoReact height="90vh" defaultLanguage="javascript" defaultValue="// some comment" />;
}
