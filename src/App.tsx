import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import './App.css'
import StackyLogo from './assets/stacky.svg?react'

import init, { run } from "../pkg/stacky_wasm_interpreter";

export default function App() {
  const [initialized, setInitialized] = useState(false);
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const [output, setOutput] = useState<string>('')

  useEffect(() => {
    (async () => {
      try {
        await init();
        setInitialized(true);
      } catch (error) {
        console.error('Failed to initialize WASM:', error);
      }
    })();
  }, []);

  if (!initialized) {
    return;
  }

  const onMount = async (editor: any, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Register language and providers
    try {
      monaco.languages.register({ id: 'stacky' })
    } catch (e) {
      // already registered
    }

    const commands: string[] = [
      'nop',
      'push',
      'pop',
      'add',
      'sub',
      'mul',
      'div',
      'mod',
      'neg',
      'dup',
      'print',
      'println',
      'read',
      'goto',
      'br',
      'load',
      'store',
      'gt',
      'lt',
      'ge',
      'le',
      'eq',
      'ne',
      'and',
      'or',
      'not',
      'xor',
      'shl',
      'shr',
      'convert',
      'rotl',
      'rotr',
      'clz',
      'ctz',
      'min',
      'max',
      'abs',
      'sign',
      'ceil',
      'floor',
      'trunc',
      'sqrt',
      'pow',
      'sin',
      'cos',
      'tan',
      'asin',
      'acos',
      'atan',
      'sinh',
      'cosh',
      'tanh',
      'asinh',
      'acosh',
      'atanh',
      'exp',
      'log',
      'len',
      'getarg',
      'assert',
      'error',
      'exit'
    ]

    const typeNames = ['string', 'int', 'float', 'bool', 'nil']

    // Try to extract labels and locals from document text
    const text = editor.getModel()?.getValue() || ''
    const labels: string[] = []
    const locals: string[] = []
    for (const l of text.split(/\n/)) {
      const t = l.trim()
      if (t.endsWith(':')) {
        labels.push(t.replace(/:$/, ''))
      }
      if (t.startsWith('store ')) {
        const rest = t.slice(6).trim()
        const name = rest.split(/\s+/)[0]
        if (name) locals.push(name)
      }
    }

    monaco.languages.setMonarchTokensProvider('stacky', {
      defaultToken: '',
      tokenizer: {
        root: [
          [/;.*$/, 'comment'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/0[xX][0-9a-fA-F]+/, 'number.hex'],
          [/0[bB][01]+/, 'number.binary'],
          [/\b\d+\.\d+\b/, 'number.float'],
          [/\b\d+\b/, 'number'],
          [/[a-zA-Z_][a-zA-Z0-9_]*/, {
            cases: {
              '@keywords': 'keyword',
              '@default': 'identifier'
            }
          }]
        ]
      },
      keywords: commands
    })

    monaco.languages.setLanguageConfiguration('stacky', { comments: { lineComment: ';' } })

    monaco.languages.registerCompletionItemProvider('stacky', {
      triggerCharacters: [' '],
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }

        const lineNumber = position.lineNumber - 1
        const lines = model.getValue().split('\n')
        const lineText = lineNumber < lines.length ? lines[lineNumber] : ''
        const prefix = lineText.slice(0, Math.min(position.column - 1, lineText.length))

        // If inside a comment, return nothing
        if (prefix.includes(';')) {
          return { suggestions: [] }
        }

        const suggestions: any[] = []

        // Determine if we are at line head (no non-space token before cursor or single unfinished token)
        const isLineHead = (() => {
          if (!lineText) return true
          const p = prefix
          if (p.trim() === '') return true
          const parts = p.split(/\s+/)
          return parts.length <= 1 && !p.endsWith(' ')
        })()

        if (isLineHead) {
          for (const cmd of commands) {
            suggestions.push({
              label: cmd,
              kind: monaco.languages.CompletionItemKind.Method,
              insertText: cmd + ' ',
              detail: 'command',
              documentation: { value: `Stacky command: ${cmd}` },
              range
            })
          }
        }

        // show constants after 'push'
        if (/\bpush\s+$/.test(prefix) || /\bpush$/.test(prefix)) {
          for (const c of ['true', 'false', 'nil']) {
            suggestions.push({
              label: c,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: c,
              detail: 'constant',
              documentation: { value: `constant ${c}` },
              range
            })
          }
        }

        // suggestions for convert types
        if (/^\s*convert(\s+\S*)?$/.test(prefix)) {
          for (const t of typeNames) {
            suggestions.push({
              label: t,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: t,
              detail: 'type',
              documentation: { value: `type ${t}` },
              range
            })
          }
        }

        // show labels or locals after certain previous token
        const lastToken = prefix.trim().split(/\s+/).slice(-1)[0] || ''
        if (lastToken === 'goto' || lastToken === 'br') {
          for (const label of labels) {
            suggestions.push({
              label,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: label,
              detail: 'label',
              documentation: { value: `label ${label}` },
              range
            })
          }
        }

        if (lastToken === 'load' || lastToken === 'store') {
          for (const local of locals) {
            suggestions.push({
              label: local,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: local,
              detail: 'variable',
              documentation: { value: `variable ${local}` },
              range
            })
          }
        }

        return { suggestions }
      }
    })

    // Set model language to stacky if available
    const model = editor.getModel()
    if (model) monaco.editor.setModelLanguage(model, 'stacky')
  }

  function onRun() {
    const src = editorRef.current?.getValue() || ''
    let out = run(src)
    setOutput(out)
    console.log(out);
  }

  return (
    <div className="app-card">
      <div className="editor-wrap">
        <Editor
          height="400px"
          defaultLanguage="stacky"
          defaultValue={"push \"hello, stacky!\"\nprint"}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            padding: { top: 10 },
            fontSize: 15,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto'
            },
            scrollBeyondLastLine: false
          }}
          onMount={onMount}
        />
      </div>
      <div className="output">
        <div className="output-label">output:</div>
        <pre>{output}</pre>
      </div>
      <div className="toolbar">
        <StackyLogo className="stacky-logo" />
        <button onClick={onRun}>Run</button>
      </div>
    </div>
  )
}
