# Mermaid TextMate grammars

`mermaid.tmLanguage.json` and `mermaid.tmLanguage-markdown.json` are generated from
[bpruitt-goddard/vscode-mermaid-syntax-highlight](https://github.com/bpruitt-goddard/vscode-mermaid-syntax-highlight)
(v1.8.1).

Copyright (c) 2018 Brian Pruitt-Goddard. Licensed under the MIT License; see
`LICENSE-vscode-mermaid-syntax-highlight`.

The grammar is vendored as generated JSON so the extension has no build-time dependency on the upstream
toolchain. The Markdown grammar is injected into `text.html.markdown` to highlight fenced `mermaid` blocks.
