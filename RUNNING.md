# Running InstaStart from the beginning

This guide takes you from the downloaded source ZIP to a working Windows desktop shortcut. Use **PowerShell** for the setup commands. The guide calls `npm.cmd` explicitly so PowerShell does not select the `npm.ps1` wrapper that execution policy may block. Code blocks marked `bat` later in this guide are sample commands for the workspace command editor.

## Upgrading from the original v0.1.0 download

Close InstaStart, extract the new ZIP into a fresh folder, and follow the commands below from its `instastart` folder. Do not copy the old `node_modules` directory. The new `package.json` should show version `0.1.1` and should not list `better-sqlite3`. Existing saved workspaces use the same application data directory and database schema.

If installation still mentions `better-sqlite3` or asks for Visual Studio C++ tools while installing that package, check that your terminal is in the new source folder.

## 1. Install the prerequisites

Install **Node.js 24.15 or newer in the 24.x series**, including npm, from [nodejs.org](https://nodejs.org/en/download). The project expects Node 24; its dependency versions are recorded in `package-lock.json`.

After installation, open a new PowerShell terminal and check:

```powershell
node --version
npm.cmd --version
```

The Node output should be `v24.15.0` or a newer 24.x version. Your existing Node 24.15 installation is supported. Git is optional if you are starting from the ZIP. You also need the applications you want to launch, such as Google Chrome, VS Code, or IntelliJ.

## 2. Extract the source project

Extract `InstaStart-v0.1.1.zip` to a normal writable folder. For example, the resulting project folder could be:

```text
D:\projects\instastart
```

That folder should directly contain `package.json`, `package-lock.json`, `README.md`, `RUNNING.md`, and `src`. If extraction creates two nested `instastart` directories, use the inner directory containing `package.json`.

Open PowerShell and enter the project directory:

```powershell
Set-Location "D:\projects\instastart"
```

Replace the example path with your actual location.

## 3. Install the project dependencies

```powershell
npm.cmd ci --include=dev
```

This installs the versions in the lockfile, including Electron. The first install needs internet access and may take several minutes. Do not copy a `node_modules` folder from a different operating system or CPU architecture.

Version 0.1.1 uses SQLite already included in Node/Electron. The database no longer requires `better-sqlite3`, Python, or the Visual Studio C++ build tools. `--include=dev` ensures the Electron Forge development tools are installed. Wait for installation to finish successfully before starting the app.

## 4. Start the development application

```powershell
npm.cmd start
```

Keep this PowerShell terminal open while using the development app. Forge builds the main process, preload bridge, and React interface, then opens InstaStart.

If Windows Firewall asks about the development server, access is only needed for local development. The packaged application does not require that development server.

## 5. Configure your application paths

Open **Settings** in InstaStart and select **Detect apps**. Review the results and use each folder button to choose an executable when necessary. Select **Save settings** after manual changes.

Common locations are shown below; your installed version/location may differ.

| Application           | Example location                                            |
| --------------------- | ----------------------------------------------------------- |
| Chrome                | `C:\Program Files\Google\Chrome\Application\chrome.exe`     |
| VS Code, user install | `%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`        |
| IntelliJ IDEA         | Its installation folder followed by `bin\idea64.exe`        |
| Command Prompt        | `C:\Windows\System32\cmd.exe`                               |
| Windows PowerShell    | `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` |
| PowerShell 7          | `C:\Program Files\PowerShell\7\pwsh.exe`                    |

Use the native `.exe` for VS Code instead of `code.cmd` in the IDE binding. Toolbox-managed IntelliJ installations may need to be selected manually. PowerShell 7 is optional.

Environment-variable notation such as `%LOCALAPPDATA%` above is for locating files in Explorer. The stored application binding should be the full absolute path returned by the file picker.

## 6. Create your first workspace

Select **New workspace** or **Create your first workspace**.

1. Enter a name, such as `My development project`.
2. Choose the project's existing folder.
3. Optionally enter a description and choose a color.
4. Add the resources described below.
5. Select **Save workspace**.

### Add an IDE

Select **IDE project**, choose VS Code or IntelliJ, and keep the project path as:

```text
${projectRoot}
```

This placeholder refers to the workspace's selected project folder. You can also use a subfolder, such as `${projectRoot}/backend`.

### Add Google Chrome links

Select **Chrome tabs** and enter one complete URL per line, for example:

```text
https://github.com/
https://developer.mozilla.org/
```

Leave the Chrome profile field empty to use its normal behavior. To request a specific profile directory, enter a value such as `Default` or `Profile 1`. This is Chrome's directory name, which may differ from its friendly profile name. You can inspect the profile path on `chrome://version` in that profile's existing browser window; use only the last directory name.

The app does not log you into websites. Chrome uses its existing profile and sessions.

### Add project notes or a folder

Select **File or folder**, choose the appropriate type, and select an existing file/folder. The app includes `examples\notes.txt` for a simple first test. A file opens through its Windows file association.

You can mark a nonessential resource **Skip if missing** under **Order and behavior**. A missing required resource prevents the whole launch during preflight.

### Add another desktop application

Select **Application**, choose the `.exe`, and set its working directory. Add arguments one per line, without adding surrounding quotes merely because an argument contains spaces. InstaStart passes the lines as separate arguments.

## 7. Add sequential Windows commands

Select **Commands**. Choose **Command Prompt** and **Ordered commands**. Keep **Working directory** as `${projectRoot}`.

For a first test, use two commands:

| Order | Name            | Command                      |
| ----- | --------------- | ---------------------------- |
| 1     | Greeting        | `echo Starting my workspace` |
| 2     | Inspect project | `dir`                        |

Select **Add command** to add more steps. Use the up-arrow to move a command earlier in the sequence. Set a sensible timeout for each step. Leave **Continue after failure** unchecked unless you intentionally want later commands to run after a failed step.

Each step uses a fresh shell. Set the working directory in its field instead of adding a `cd` step and expecting the next shell to inherit that directory. Environment overrides are available under **Environment variables**.

When several commands need shared state, switch to **One shared script**. For example:

```bat
@echo off
set MY_PROJECT_MODE=local
echo %MY_PROJECT_MODE%
call npm.cmd run build
if errorlevel 1 exit /b 1
echo Build completed
```

This build example assumes the selected project already has Node dependencies and defines a `build` script. Configure commands appropriate to your project; InstaStart does not install your project's dependencies automatically.

Use **Import script…** to copy the contents of a UTF-8 `.cmd`, `.bat`, or `.ps1` file into the editor. Select the matching shell. Later edits to the original file do not change the copied script; import it again if needed.

For PowerShell file execution errors, inspect your execution policy in PowerShell with `Get-ExecutionPolicy -List`. If your machine permits it, `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` allows locally authored scripts under that policy. Organization policies may override this. InstaStart does not change or bypass execution policy.

## 8. Choose resource ordering

Resources normally launch independently. To open Chrome only after a command sequence succeeds:

1. Expand the Chrome resource.
2. Open **Order and behavior**.
3. Check **After** next to the command-sequence resource.
4. Save the workspace.

The editor rejects dependency cycles. A resource cannot depend on a disabled resource. Reordering workspace resource cards changes their display/scheduling preference; explicit **After** selections define dependencies. Reordering commands inside a command sequence changes their execution order.

## 9. Test the workspace

Select **Check resources without launching** to inspect paths and bindings. Then select **Launch workspace**.

The launch view shows each resource's result. Select a Commands resource to inspect its steps and output. A failure should show a useful message or exit code. Independent resources may still finish; resources depending on the failure remain blocked.

To test failure handling deliberately, use `exit /b 7` as a Command Prompt step before `echo SHOULD_NOT_RUN`. The second command should remain blocked when continuation is disabled. Remove this test afterward.

Use **Cancel launch** to stop pending work and the command process tree owned by the run. Use **Retry failed resources** deliberately: a failed sequence restarts at its first command, and command side effects are not rolled back.

Commands that wait for user input are not supported in captured-output mode. A command such as `npm run dev` usually never exits; v0.1 will wait until it ends or times out. Service supervision/readiness checks belong to a later release.

## 10. Run the automated checks

Stop the development app before changing dependencies or packaging. Then run:

```powershell
npm.cmd run verify
```

This runs TypeScript checking, linting, and the test suite. On Windows, it also runs the native Command Prompt sequence tests. The tests create temporary fixtures and do not launch your personal workspaces.

## 11. Build a standalone application folder

On the Windows computer where you will run it:

```powershell
npm.cmd run package
```

For a typical x64 Windows machine, the output is:

```text
out\InstaStart-win32-x64\
```

Open `InstaStart.exe` from that folder. Keep the complete folder intact, including `resources` and the accompanying runtime files. An ARM64 build uses the corresponding `arm64` folder suffix.

Before making project shortcuts, copy the entire application folder to a permanent location, for example:

```text
D:\Apps\InstaStart\
```

Open the executable from that permanent location. You can use the packaged application without keeping the development terminal open. Node.js is needed to develop/build the project, but the packaged app carries its own runtime.

## 12. Create your project desktop icon

In the packaged app:

1. Select the saved workspace.
2. Click **Create desktop shortcut**.
3. Close InstaStart after any active launch finishes.
4. Double-click the new desktop icon.
5. Confirm that the apps, Chrome links, notes, and commands launch correctly.

Repeat the test with InstaStart already running. Both paths should work. Edit the workspace and try its existing shortcut again; it should use the updated definition.

Development mode deliberately does not create shortcuts. If the UI tells you to create a packaged build first, follow step 11.

## 13. Create an installer, optionally

Run this on Windows:

```powershell
npm.cmd run make
```

Inspect `out\make` for the Squirrel Windows installer and ZIP artifacts. Installer output normally appears beneath `out\make\squirrel.windows`, and ZIP output beneath `out\make\zip`.

The project has no signing certificate configured. A locally produced installer is unsigned. Configure signing before distributing the app broadly. The included GitHub Actions workflow builds and uploads Windows packaging artifacts when the project is placed in a repository with Actions enabled.

Build Windows packages on Windows with the target CPU architecture. Linux packaging is used only for portable UI checks; Windows integration and installer behavior still need a Windows acceptance run.

## Troubleshooting

| Problem                                                        | What to check                                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `node` or `npm` is not recognized                              | Reopen PowerShell after installing Node 24.15 or newer in the 24.x series. Confirm Node was added to PATH.                 |
| PowerShell refuses `npm.ps1`                                   | Use `npm.cmd` as shown throughout this guide. No execution-policy change is needed to invoke npm this way.                 |
| `npm.cmd ci --include=dev` fails downloading Electron/packages | Check internet/proxy access. Retry `npm.cmd ci --include=dev`; do not use a dependency folder copied from another machine. |
| IDE/browser not found                                          | Select its actual `.exe` in Settings. Re-run Detect apps after an application update, or relink it manually.               |
| Notes/file fails validation                                    | Select an existing file. The file action does not execute scripts; use Commands or Application for executable content.     |
| Next command does not see `cd` or an activated environment     | Set Working directory/environment fields, or use one shared script.                                                        |
| A command never finishes                                       | It may be an interactive program or server. Use finite commands in v0.1 and configure a timeout.                           |
| A PowerShell command is blocked                                | Inspect execution policy and use locally allowed scripts; the launcher respects that policy.                               |
| Browser launches but page/login is not ready                   | The status reports launch acceptance. Chrome handles network requests and authentication.                                  |
| Desktop shortcut breaks after moving the app                   | Open the executable from its new permanent location and recreate the shortcut.                                             |
| A workspace edit reports a revision conflict                   | Close the editor and reopen the current saved workspace.                                                                   |
| Previous run says Interrupted                                  | The app stopped before recording a final result. Inspect what is already open before starting again.                       |

## Before relying on it daily

Check a real workspace on your Windows machine with the launcher both closed and running. Confirm the right IDE folder, Chrome profile/links, and notes. Verify command order, failure stopping, cancellation, and a project path containing spaces. Finally, verify that the desktop shortcut still uses the updated workspace after editing its settings.

The source was checked with portable automated tests and Linux desktop packaging. Native Windows integration tests are included, but a local Windows acceptance run is still required for your installed applications and generated `.lnk` files.
