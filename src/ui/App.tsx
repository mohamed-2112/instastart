import { useEffect, useRef, useState } from 'react';
import type { Bootstrap, Run } from '../shared/types';
import { appIds, type Settings, type Workspace } from '../shared/schema';
import { Editor, PathField } from './Editor';
import { Icon } from './Icons';
import { newWorkspace, uid, icons, actionDescription } from './models';
import s from './styles.module.css';

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`${s.badge} ${s[`status_${status}`] ?? ''}`}>
      <span className={s.dot} />
      {status === 'succeeded'
        ? 'Completed'
        : status === 'partial'
          ? 'Needs attention'
          : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
function relativeTime(date: string) {
  const delta = Math.max(0, (Date.now() - new Date(date).getTime()) / 60000);
  return delta < 1
    ? 'Just now'
    : delta < 60
      ? `${Math.floor(delta)} min ago`
      : new Date(date).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
}
function AppSettings({
  data,
  refresh,
  notify,
}: {
  data: Bootstrap;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [settings, setSettings] = useState<Settings>(structuredClone(data.settings));
  const [busy, setBusy] = useState(false);
  const names = {
    chrome: 'Google Chrome',
    vscode: 'Visual Studio Code',
    intellij: 'IntelliJ IDEA',
    cmd: 'Command Prompt',
    powershell: 'Windows PowerShell',
    pwsh: 'PowerShell 7 (optional)',
  };
  return (
    <>
      <div className={s.pageHeading}>
        <div>
          <span className={s.eyebrow}>MAKE YOURSELF AT HOME</span>
          <h1>Application settings</h1>
          <p>Connect InstaStart to the tools already on your computer.</p>
        </div>
        <button
          className={s.secondary}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void window.instastart
              .detectApps()
              .then((settings) => {
                setSettings(settings);
                notify('Application paths refreshed.');
                return refresh();
              })
              .catch((e) => notify(String(e)))
              .finally(() => setBusy(false));
          }}
        >
          <Icon name="search" size={17} /> Detect apps
        </button>
      </div>
      <section className={s.settingsPanel}>
        <div className={s.panelIntro}>
          <Icon name="monitor" size={22} />
          <div>
            <h3>Installed applications</h3>
            <p>Choose the actual .exe file. Existing workspaces use these paths.</p>
          </div>
        </div>
        <div className={s.settingsFields}>
          {appIds.map((id) => (
            <PathField
              key={id}
              label={names[id]}
              kind="executable"
              value={settings.bindings[id]}
              onChange={(value) => setSettings({ bindings: { ...settings.bindings, [id]: value } })}
            />
          ))}
        </div>
        <div className={s.settingsFooter}>
          <button
            className={s.primary}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void window.instastart
                .saveSettings(settings)
                .then(() => {
                  notify('Settings saved.');
                  return refresh();
                })
                .catch((e) => notify(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            Save settings
            <Icon name="check" size={17} />
          </button>
        </div>
      </section>
      <section className={s.localInfo}>
        <Icon name="folder" />
        <div>
          <strong>Your data stays here</strong>
          <p>Workspaces and the latest 100 runs are stored locally.</p>
          <code>{data.dataPath}</code>
          <p>
            InstaStart {data.version} ·{' '}
            {data.packaged ? 'Packaged application' : 'Development build'}
          </p>
        </div>
      </section>
    </>
  );
}
function RunDialog({
  run,
  onClose,
  onCancel,
  onRetry,
}: {
  run: Run;
  onClose: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const resource =
    run.actions.find((a) => a.id === selected) ??
    run.actions.find((a) => a.status === 'running') ??
    run.actions.find((a) => a.status === 'failed') ??
    run.actions[0];
  const completed = run.actions.filter((a) => ['succeeded', 'skipped'].includes(a.status)).length;
  return (
    <div className={s.overlay}>
      <section className={s.runDialog} role="dialog" aria-modal="true" aria-labelledby="run-title">
        <header className={s.modalHeader}>
          <div>
            <span className={s.eyebrow}>LAUNCH DETAILS</span>
            <h2 id="run-title">{run.workspaceName}</h2>
          </div>
          <button className={s.iconButton} aria-label="Close launch details" onClick={onClose}>
            <Icon name="x" />
          </button>
        </header>
        <div className={s.runSummary}>
          <StatusBadge status={run.status} />
          <span>
            {completed} of {run.actions.length} resources completed
          </span>
          <span>{relativeTime(run.startedAt)}</span>
        </div>
        <div className={s.runContent}>
          <div className={s.runActions}>
            {run.actions.map((a) => (
              <button
                key={a.id}
                className={`${s.runAction} ${resource?.id === a.id ? s.runActionSelected : ''}`}
                onClick={() => setSelected(a.id)}
              >
                <Icon name={icons[a.type as keyof typeof icons] ?? 'grid'} />
                <div>
                  <strong>{a.name}</strong>
                  <StatusBadge status={a.status} />
                </div>
                <Icon name="arrow" size={15} />
              </button>
            ))}
          </div>
          <div className={s.runOutput}>
            {resource ? (
              <>
                <div className={s.outputHeader}>
                  <h3>{resource.name}</h3>
                  <p>
                    {resource.message ||
                      (resource.status === 'queued' ? 'Waiting for its turn.' : 'Working…')}
                  </p>
                </div>
                {resource.steps.length > 0 && (
                  <div className={s.stepResults}>
                    {resource.steps.map((step) => (
                      <div key={step.id}>
                        <span>{step.name}</span>
                        <StatusBadge status={step.status} />
                        {step.message && <small>{step.message}</small>}
                      </div>
                    ))}
                  </div>
                )}
                <pre className={s.console} aria-label="Command output">
                  {resource.logs ||
                    (resource.type === 'commands'
                      ? 'Command output will appear here.'
                      : 'This resource hands off to its desktop application. There is no captured output.')}
                </pre>
              </>
            ) : (
              <p>No enabled resources.</p>
            )}
          </div>
        </div>
        <footer className={s.modalFooter}>
          <p>Application handoff does not confirm that a page has loaded.</p>
          {run.status === 'running' ? (
            <button className={s.dangerButton} onClick={onCancel}>
              <Icon name="stop" size={16} /> Cancel launch
            </button>
          ) : ['failed', 'partial', 'cancelled'].includes(run.status) ? (
            <button className={s.secondary} onClick={onRetry}>
              <Icon name="history" size={16} /> Retry failed resources
            </button>
          ) : null}
          <button className={s.primary} onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<Bootstrap | null>(null),
    [error, setError] = useState('');
  const [page, setPage] = useState<'workspaces' | 'history' | 'settings'>('workspaces');
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Workspace | null>(null),
    [run, setRun] = useState<Run | null>(null),
    [runOpen, setRunOpen] = useState(false);
  const [toast, setToast] = useState(''),
    [busy, setBusy] = useState(false);
  const lastObservedRun = useRef<string | undefined>(undefined);
  const [confirm, setConfirm] = useState<{
    title: string;
    detail: string;
    label: string;
    action: () => Promise<void>;
  } | null>(null);
  const notify = (message: string) => setToast(message);
  const refresh = async () => {
    const latest = await window.instastart.bootstrap();
    setData(latest);
    setSelectedId((id) =>
      latest.workspaces.some((w) => w.id === id) ? id : (latest.workspaces[0]?.id ?? null),
    );
  };
  useEffect(() => {
    if (!window.instastart) {
      setError(
        'Open InstaStart with npm start or its packaged desktop application. This interface needs the desktop runtime.',
      );
      return;
    }
    void window.instastart
      .bootstrap()
      .then(async (data) => {
        setData(data);
        setSelectedId(data.workspaces[0]?.id ?? null);
        const activeId = data.launchRunId ?? data.runs.find((r) => r.status === 'running')?.id;
        if (activeId) {
          setRun(await window.instastart.getRun(activeId));
          setRunOpen(true);
        }
      })
      .catch((e) => setError(String(e)));
    return window.instastart.onRun((next) => {
      if (next.status === 'running' && lastObservedRun.current !== next.id) {
        lastObservedRun.current = next.id;
        setRunOpen(true);
      }
      setRun((previous) =>
        !previous || previous.id === next.id || next.status === 'running' ? next : previous,
      );
      if (next.status !== 'running') void refresh();
    });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  const selected = data?.workspaces.find((w) => w.id === selectedId);
  const start = async (w: Workspace, retryRunId?: string) => {
    setBusy(true);
    try {
      setRun(await window.instastart.launchWorkspace(w.id, retryRunId));
      setRunOpen(true);
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const perform = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <div className={s.loading}>
        <div className={s.brandMark}>
          <Icon name="bolt" size={32} />
        </div>
        <h2>InstaStart</h2>
        <p>{error || 'Preparing your workspaces…'}</p>
      </div>
    );
  const filtered = data.workspaces.filter((w) =>
    `${w.name} ${w.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className={s.app}>
      <aside className={s.sidebar}>
        <a
          className={s.brand}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage('workspaces');
          }}
        >
          <span className={s.brandMark}>
            <Icon name="bolt" size={25} />
          </span>
          InstaStart<span className={s.brandDot}>.</span>
        </a>
        <div className={s.sidebarLabel}>YOUR SPACE</div>
        <nav aria-label="Main navigation">
          {(
            [
              { id: 'workspaces', icon: 'grid', title: 'Workspaces' },
              { id: 'history', icon: 'history', title: 'Launch history' },
              { id: 'settings', icon: 'settings', title: 'Settings' },
            ] as const
          ).map((item) => (
            <button
              className={`${s.navItem} ${page === item.id ? s.navActive : ''}`}
              key={item.id}
              onClick={() => setPage(item.id)}
            >
              <Icon name={item.icon} />
              {item.title}
              {item.id === 'workspaces' && <span>{data.workspaces.length}</span>}
            </button>
          ))}
        </nav>
        <div className={s.sidebarNote}>
          <div className={s.orbit}>
            <Icon name="bolt" size={34} />
          </div>
          <strong>
            Less setup.
            <br />
            More making.
          </strong>
          <p>Your tools, tabs, and commands. One click away.</p>
        </div>
        <div className={s.sidebarFooter}>
          <span className={s.onlineDot} />
          <div>
            <strong>Local by design</strong>
            <small>Everything on your computer</small>
          </div>
        </div>
      </aside>
      <main className={s.main}>
        <div className={s.topbar}>
          <span>
            <Icon name="folder" size={16} /> Your personal launchpad
          </span>
          <span className={s.platformPill}>
            <span className={s.dot} />
            {data.platform === 'win32' ? 'Windows' : 'Windows project · preview host'}
          </span>
        </div>
        {page === 'workspaces' && (
          <>
            <div className={s.pageHeading}>
              <div>
                <span className={s.eyebrow}>PICK UP WHERE YOU LEFT OFF</span>
                <h1>Ready for your next session.</h1>
                <p>Bring your whole project to life with a single click.</p>
              </div>
              <button className={s.primary} onClick={() => setEditor(newWorkspace())}>
                <Icon name="plus" size={18} /> New workspace
              </button>
            </div>
            {data.workspaces.length === 0 ? (
              <section className={s.emptyHero}>
                <div className={s.emptyIllustration}>
                  <span>
                    <Icon name="code" size={31} />
                  </span>
                  <span>
                    <Icon name="globe" size={31} />
                  </span>
                  <span>
                    <Icon name="terminal" size={31} />
                  </span>
                  <div className={s.illustrationLine} />
                </div>
                <span className={s.eyebrow}>YOUR NEXT GREAT PROJECT STARTS HERE</span>
                <h2>One workspace. All your essentials.</h2>
                <p>
                  Choose your project folder, add the tools you need,
                  <br />
                  and make a desktop shortcut for an effortless start.
                </p>
                <button className={s.primary} onClick={() => setEditor(newWorkspace())}>
                  Create your first workspace
                  <Icon name="arrow" size={18} />
                </button>
                <div className={s.emptySteps}>
                  {['Choose a project', 'Add apps & commands', 'Launch in one click'].map(
                    (text, i) => (
                      <div key={text}>
                        <span>0{i + 1}</span>
                        {text}
                      </div>
                    ),
                  )}
                </div>
              </section>
            ) : (
              <div className={s.workspaceLayout}>
                <section className={s.workspaceList}>
                  <div className={s.listHeader}>
                    <h3>
                      Your workspaces <span>{data.workspaces.length}</span>
                    </h3>
                    <label className={s.search}>
                      <Icon name="search" size={16} />
                      <input
                        aria-label="Search workspaces"
                        placeholder="Find a workspace…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className={s.cards}>
                    {filtered.map((w) => (
                      <button
                        key={w.id}
                        className={`${s.workspaceCard} ${s[w.color]} ${selected?.id === w.id ? s.cardSelected : ''}`}
                        onClick={() => setSelectedId(w.id)}
                      >
                        <div className={s.cardTop}>
                          <span className={s.workspaceIcon}>
                            <Icon name="folder" size={25} />
                          </span>
                          {selected?.id === w.id ? (
                            <span className={s.selectedCheck}>
                              <Icon name="check" size={15} />
                            </span>
                          ) : (
                            <Icon name="arrow" size={18} />
                          )}
                        </div>
                        <h3>{w.name}</h3>
                        <p>{w.description || 'Your project, ready to go.'}</p>
                        <div className={s.cardBottom}>
                          <div className={s.resourceIcons}>
                            {[...new Set(w.actions.filter((a) => a.enabled).map((a) => a.type))]
                              .slice(0, 4)
                              .map((type) => (
                                <span key={type}>
                                  <Icon name={icons[type]} size={15} />
                                </span>
                              ))}
                          </div>
                          <span>{w.actions.filter((a) => a.enabled).length} resources</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {filtered.length === 0 && (
                    <p className={s.muted}>No workspaces match your search.</p>
                  )}
                  <button className={s.addWorkspaceCard} onClick={() => setEditor(newWorkspace())}>
                    <Icon name="plus" size={20} /> Make room for another project
                  </button>
                  <div className={s.tip}>
                    <span>
                      <Icon name="shortcut" size={19} />
                    </span>
                    <p>
                      <strong>Make it a one-click habit.</strong>
                      <br />
                      Create a desktop shortcut for any saved workspace.
                    </p>
                  </div>
                </section>
                {selected && (
                  <aside className={s.detailPanel}>
                    <div className={s.detailHeader}>
                      <span className={`${s.detailIcon} ${s[selected.color]}`}>
                        <Icon name="folder" size={28} />
                      </span>
                      <button
                        className={s.iconButton}
                        title="Edit workspace"
                        onClick={() => setEditor(selected)}
                      >
                        <Icon name="edit" size={18} />
                      </button>
                    </div>
                    <h2>{selected.name}</h2>
                    <p className={s.detailDescription}>
                      {selected.description || 'Everything you need for this project.'}
                    </p>
                    <div className={s.projectPath} title={selected.rootPath}>
                      <Icon name="folder" size={15} />
                      <span>{selected.rootPath}</span>
                    </div>
                    <button
                      className={`${s.primary} ${s.fullWidth}`}
                      disabled={busy || !selected.actions.some((a) => a.enabled)}
                      onClick={() => {
                        void start(selected);
                      }}
                    >
                      <Icon name="play" size={18} /> Launch workspace
                      <Icon name="arrow" size={17} />
                    </button>
                    <button
                      className={`${s.secondary} ${s.fullWidth}`}
                      onClick={() => {
                        void perform(async () => {
                          const result = await window.instastart.createShortcut(selected.id);
                          notify(`Shortcut created: ${result}`);
                        });
                      }}
                    >
                      <Icon name="shortcut" size={17} /> Create desktop shortcut
                    </button>
                    <div className={s.sectionDivider}>
                      <h3>Ready to open</h3>
                      <span>{selected.actions.length}</span>
                    </div>
                    <div className={s.resourceList}>
                      {selected.actions.map((a) => (
                        <div className={`${s.resource} ${!a.enabled ? s.disabled : ''}`} key={a.id}>
                          <span className={s.resourceIcon}>
                            <Icon name={icons[a.type]} size={18} />
                          </span>
                          <div>
                            <strong>{a.name}</strong>
                            <small title={actionDescription(a)}>{actionDescription(a)}</small>
                            {a.dependsOn.length > 0 && (
                              <em>
                                After {a.dependsOn.length} prerequisite
                                {a.dependsOn.length > 1 ? 's' : ''}
                              </em>
                            )}
                          </div>
                        </div>
                      ))}
                      {!selected.actions.length && (
                        <p className={s.helper}>Edit this workspace to add its first resource.</p>
                      )}
                    </div>
                    <button
                      className={s.checkButton}
                      onClick={() => {
                        void perform(async () => {
                          const issues = await window.instastart.validateWorkspace(selected.id);
                          notify(
                            issues.length
                              ? issues.map((i) => i.message).join('\n')
                              : 'All resources passed validation. Ready to launch.',
                          );
                        });
                      }}
                    >
                      <Icon name="check" size={16} /> Check resources without launching
                    </button>
                    <div className={s.detailActions}>
                      <button
                        onClick={() => {
                          const copy = structuredClone(selected);
                          copy.id = uid();
                          copy.revision = 0;
                          copy.name = `${copy.name} copy`;
                          setEditor(copy);
                        }}
                      >
                        <Icon name="copy" size={15} /> Duplicate
                      </button>
                      <button
                        onClick={() =>
                          setConfirm({
                            title: `Delete ${selected.name}?`,
                            detail:
                              'The workspace definition will be removed. Your project files and applications stay on your computer. Existing shortcuts will report that the workspace is unavailable.',
                            label: 'Delete workspace',
                            action: async () => {
                              await window.instastart.deleteWorkspace(selected.id);
                              await refresh();
                            },
                          })
                        }
                      >
                        <Icon name="trash" size={15} /> Delete
                      </button>
                    </div>
                  </aside>
                )}
              </div>
            )}
            {run?.status === 'running' && (
              <button className={s.activeBanner} onClick={() => setRunOpen(true)}>
                <span className={s.spinner} />
                <span>
                  <strong>{run.workspaceName}</strong> is launching
                </span>
                <span>
                  View progress <Icon name="arrow" size={16} />
                </span>
              </button>
            )}
          </>
        )}
        {page === 'history' && (
          <>
            <div className={s.pageHeading}>
              <div>
                <span className={s.eyebrow}>EVERY START, ACCOUNTED FOR</span>
                <h1>Launch history</h1>
                <p>Review results and pick up where a launch stopped.</p>
              </div>
              <span className={s.platformPill}>Latest {data.runs.length} runs</span>
            </div>
            <section className={s.historyList}>
              {data.runs.length ? (
                data.runs.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      void perform(async () => {
                        setRun(await window.instastart.getRun(item.id));
                        setRunOpen(true);
                      });
                    }}
                  >
                    <span className={s.historyIcon}>
                      <Icon name="history" size={22} />
                    </span>
                    <div>
                      <strong>{item.workspaceName}</strong>
                      <small>{relativeTime(item.startedAt)}</small>
                    </div>
                    <StatusBadge status={item.status} />
                    <Icon name="arrow" size={18} />
                  </button>
                ))
              ) : (
                <div className={s.emptyHistory}>
                  <Icon name="history" size={42} />
                  <h3>Your first launch is ahead.</h3>
                  <p>Workspace results and command output will appear here.</p>
                </div>
              )}
            </section>
          </>
        )}
        {page === 'settings' && <AppSettings data={data} refresh={refresh} notify={notify} />}
        <footer className={s.pageFooter}>
          <span>Made for the way you work.</span>
          <span>
            InstaStart <strong>v{data.version}</strong>
          </span>
        </footer>
      </main>
      {editor && (
        <Editor
          key={editor.id}
          original={editor}
          onClose={() => setEditor(null)}
          onSave={async (w) => {
            const saved = await window.instastart.saveWorkspace(w);
            await refresh();
            setSelectedId(saved.id);
            setEditor(null);
            notify('Workspace saved. Your next session is ready.');
          }}
        />
      )}
      {runOpen && run && (
        <RunDialog
          run={run}
          onClose={() => setRunOpen(false)}
          onCancel={() => {
            void perform(async () => window.instastart.cancelRun(run.id));
          }}
          onRetry={() => {
            const w = data.workspaces.find((w) => w.id === run.workspaceId);
            if (!w) {
              notify('This workspace has been deleted.');
              return;
            }
            setConfirm({
              title: 'Retry failed resources?',
              detail:
                'Successful resources will stay open. Failed command sequences restart from their first command, so earlier steps in that sequence may run again.',
              label: 'Retry failed resources',
              action: () => start(w, run.id),
            });
          }}
        />
      )}
      {confirm && (
        <div className={`${s.overlay} ${s.confirmOverlay}`}>
          <section
            className={s.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <span className={s.confirmIcon}>
              <Icon name="alert" size={26} />
            </span>
            <h2 id="confirm-title">{confirm.title}</h2>
            <p>{confirm.detail}</p>
            <div>
              <button className={s.secondary} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className={s.primary}
                onClick={() => {
                  const task = confirm.action;
                  setConfirm(null);
                  void perform(task);
                }}
              >
                {confirm.label}
              </button>
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div className={s.toast} role="status">
          <Icon name="alert" size={19} />
          <span>{toast}</span>
          <button
            className={s.iconButton}
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
