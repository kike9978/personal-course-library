# personal-course-library

Local Electron + React catalog for courses stored on disk.

## Setup

```bash
bun install
bun run dev
```

On first launch, choose the folder that contains your course directories. The path is saved in the app userData config and works across Windows, macOS, and Linux.

## Scripts

```bash
bun run dev          # development
bun run build        # compile
bun run build:win    # Windows installer
bun run build:mac    # macOS build
bun run build:linux  # Linux build
bun run generate:json -- "/path/to/courses"  # create missing courseProps.json files
```
