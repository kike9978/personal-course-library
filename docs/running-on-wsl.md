# Running on WSL

This app is Electron + React. Development starts with:

```bash
bun install
bun dev
```

`bun dev` runs `electron-vite dev`. Vite serves the renderer, then Electron opens the window.

## Missing X server or $DISPLAY

On WSL the renderer can start and Electron still exits:

```
dev server running for the electron renderer process at:

  ➜  Local:   http://localhost:5173/

start electron app...

ERROR:ozone_platform_x11.cc: Missing X server or $DISPLAY
ERROR:env.cc: The platform failed to initialize. Exiting.
```

Electron needs a display. `http://localhost:5173/` is only the React page. Opening it in a browser does not run the app, because the Electron main process and preload never start.

### Windows 11 (WSLg)

In the same terminal:

```bash
export DISPLAY=:0
bun dev
```

If the window still does not open, from PowerShell:

```powershell
wsl --status
wsl --update
wsl --shutdown
```

Open a new WSL terminal, set `DISPLAY` again, and run `bun dev`.

### Windows 10 (no WSLg)

Install an X server on Windows (VcXsrv or X410), allow connections, and start it. Then in WSL:

```bash
export DISPLAY=$(grep nameserver /etc/resolv.conf | awk '{print $2}'):0
export LIBGL_ALWAYS_INDIRECT=1
bun dev
```

Add those `export` lines to `~/.bashrc` if you want them in every shell.
