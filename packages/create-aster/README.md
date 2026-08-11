# create-aster

Scaffold an [aster](https://www.npmjs.com/package/aster) agent project:

```sh
npm create aster@latest my-agent
```

Interactive on a TTY (project name, model provider — including
OpenAI-compatible endpoints like Ollama — and a capability preset). Every
prompt has a flag; `--yes` skips them all:

```sh
npm create aster@latest my-agent -- --yes --provider compatible --base-url http://localhost:11434 --model local/llama3.3 --preset team
```

This package is a thin wrapper around `aster init`; see the aster docs for
everything else.
