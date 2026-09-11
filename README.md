# RepoLens

> **Understand a repository before you touch it.**

RepoLens is a repository intelligence tool that turns an unfamiliar codebase into a visual, understandable architecture model.

Instead of manually opening dozens of files, developers can upload a repository ZIP and quickly inspect its structure, source files, Python functions, classes, imports, dependencies, and potential change impact.

---

## Why RepoLens?

Understanding an unfamiliar codebase can take hours.

Developers often need to answer questions such as:

- Where does the application start?
- Which files depend on each other?
- What functions and classes exist?
- Which file is risky to modify?
- What could break if this module changes?

RepoLens reduces that initial exploration time by automatically analyzing repository structure and presenting the result visually.

---

## Core Features

### Secure Repository Inspection

RepoLens treats uploaded repositories as untrusted input.

The analysis pipeline includes:

- ZIP validation
- path traversal protection
- archive/resource limits
- malformed source handling
- dependency/cache directory filtering
- source files are analyzed without executing repository code

### Repository Structure

RepoLens converts repository paths into a navigable file tree.

Ignored directories include:

- `.git`
- `.venv`
- `venv`
- `node_modules`
- `__pycache__`
- `dist`
- `build`

### Python AST Intelligence

Python files are parsed using Python's Abstract Syntax Tree rather than simple regular expressions.

RepoLens can identify:

- functions
- async functions
- classes
- imports
- parse failures

### Dependency Mapping

Import relationships are used to build a dependency model between source files.

The frontend visualizes these relationships as an architecture graph.

### Change Impact Analysis

RepoLens can estimate the direct blast radius of modifying a source file.

Example:

```text
auth.py changes
      ↓
main.py
users.py
api.py

