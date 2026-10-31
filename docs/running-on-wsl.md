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

## Folder on a Windows external disk

The app runs inside Linux. **Elegir carpeta** and **Cambiar carpeta** open the Linux file dialog, so a drive you see in Windows Explorer is not listed until WSL mounts it.

Windows already gives that disk a letter (`E:`, `F:`, …). WSL exposes it at `/mnt/<letter>`. Fixed drives are usually there already. A USB or external disk often is not, especially if you plugged it in after WSL started.

In PowerShell, confirm the letter:

```powershell
Get-PSDrive -PSProvider FileSystem
```

In WSL, use the same letter in lowercase. This example is `E:`:

```bash
ls /mnt/e
```

If that directory is missing or empty, mount the Windows drive:

```bash
sudo mkdir -p /mnt/e
sudo mount -t drvfs E: /mnt/e
ls /mnt/e
```

### Pick the folder in the Linux dialog

**Elegir carpeta** opens a Linux picker. The location bar starts in your home (for example `home / machu`). Windows is not a top-level item. You cannot type `E:\Courses`.

1. In the folder list, open **`mnt`**. That is `/mnt`.
2. Open the drive letter in lowercase (`c` is `C:`, `e` is `E:`).
3. Open the course folder and click **Open**.

Other ways in the same window:

- Sidebar → **Other Locations** — mounted Windows drives often appear there.
- Press **Ctrl+L**, type the Linux path (for example `/mnt/e/Courses`), then Enter.

The same path works for a linked project folder. If the letter is missing under `mnt`, mount the drive first (see above).

To mount it again after a reboot, add this line to `/etc/fstab` (still using your drive letter):

```
E: /mnt/e drvfs defaults 0 0
```

`/etc/wsl.conf` should keep fstab mounts enabled (this is the default):

```
[automount]
mountFsTab=true
```

From PowerShell, `wsl --shutdown`, then open a new WSL terminal. Plug the disk in before you start the app. If it was connected later, run the `mount -t drvfs` command again.

Reading video and scanning many files through `/mnt` is slower than a folder on the Linux filesystem (`~/`). That is normal for a Windows drive.
