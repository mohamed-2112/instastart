# Changes

## 0.1.1 — Windows dependency installation fix

The original release used `better-sqlite3@13.0.3`. A reported npm installation issue can invoke `node-gyp rebuild` even when the package includes a prebuilt Windows binary. On machines without Visual Studio C++ Build Tools this stops dependency installation, leaving the Electron Forge command unavailable.

This release removes that dependency and uses `DatabaseSync` from the `node:sqlite` module already included in the pinned Electron runtime. SQLite remains the storage engine. The database location, schema, workspace IDs, revision checks, and run history format remain compatible with v0.1.0.

### Code changes

- `src/infrastructure/repository.ts`: use the built-in SQLite connection, explicit SQL transactions, and rollback on failed workspace edits.
- `package.json` and `package-lock.json`: remove `better-sqlite3`, its types, and native-addon packaging helpers. Remove the native rebuild test step. Set version 0.1.1 and require Node 24.15 or newer within 24.x.
- `webpack.main.cjs` and `forge.config.cjs`: remove the external SQLite binary alias, relocation loaders, and unpacking plugin.
- `tests/repository.test.ts`: verify a rejected edit rolls back and the next valid edit succeeds and persists.
- `RUNNING.md`: use `npm.cmd`, explicitly install development dependencies, and explain how to upgrade from the original download.

Node's SQLite API is a release candidate in Node 24. The adapter stays isolated in the repository, and the packaged runtime remains pinned to Electron 44.7.2.

### Upgrade

Extract this version into a fresh directory. From its `instastart` folder, run the following commands in PowerShell, waiting for installation to finish successfully before starting:

```powershell
npm.cmd ci --include=dev
npm.cmd start
```

Your existing Node 24.15.0 is supported. Python and Visual Studio C++ tools are no longer needed for the app's database. Keep using the same Windows account to retain existing application data. If using a portable packaged app, rebuild it and recreate shortcuts after moving its executable to a different location.

### Validation

The fix is checked with a clean dependency install, TypeScript, linting, the portable test suite, Electron packaging, and a desktop UI/storage check. Windows-specific application launch and `.lnk` behavior still require a Windows acceptance run.

### References

- [Reported better-sqlite3 13.0.3 installation issue](https://github.com/WiseLibs/better-sqlite3/issues/1516)
- [Node 24 SQLite API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)

## 0.1.0 — Initial source release

Workspace editing; IDE, Chrome, application, file, and folder resources; sequential and shared-script Windows commands; dependencies; cancellation; launch history; and desktop shortcuts.
