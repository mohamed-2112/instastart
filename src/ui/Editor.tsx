import { useState, type FormEvent } from 'react';
import { workspaceSchema, type Action, type CommandAction, type Workspace } from '../shared/schema';
import type { PickKind } from '../shared/types';
import { Icon } from './Icons';
import { newAction, uid, labels, icons } from './models';
import s from './styles.module.css';

export function PathField({
  label,
  value,
  onChange,
  kind = 'folder',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  kind?: PickKind;
}) {
  const [error, setError] = useState('');
  return (
    <label className={s.field}>
      <span>{label}</span>
      <div className={s.inputButton}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={kind === 'folder' ? 'D:\\projects\\my-project' : 'Choose a file…'}
        />
        <button
          type="button"
          title={`Browse for ${label.toLowerCase()}`}
          aria-label={`Browse for ${label.toLowerCase()}`}
          onClick={() => {
            void window.instastart
              .pickPath(kind)
              .then((p) => {
                if (p) onChange(p);
              })
              .catch((e) => setError(String(e)));
          }}
        >
          <Icon name="folder" size={18} />
        </button>
      </div>
      {error && <small className={s.errorText}>{error}</small>}
    </label>
  );
}
function EnvField({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (env: Record<string, string>) => void;
}) {
  const [text, setText] = useState(
    Object.entries(value)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
  );
  return (
    <label className={s.field}>
      <span>
        Environment overrides <small>optional · KEY=value, one per line</small>
      </span>
      <textarea
        rows={2}
        value={text}
        placeholder="NODE_ENV=development"
        onChange={(e) => {
          const input = e.target.value;
          setText(input);
          const env: Record<string, string> = {};
          let error = '';
          for (const line of input.split('\n').filter((l) => l.trim())) {
            const i = line.indexOf('=');
            const key = line.slice(0, i).trim();
            if (
              i < 1 ||
              !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
              Object.keys(env).some((k) => k.toLowerCase() === key.toLowerCase())
            ) {
              error = 'Use unique KEY=value lines.';
              break;
            }
            env[key] = line.slice(i + 1);
          }
          e.target.setCustomValidity(error);
          if (!error) onChange(env);
        }}
      />
      <small>Saved locally. Prefer your usual credential tools for secrets.</small>
    </label>
  );
}
function CommandFields({
  action,
  update,
}: {
  action: CommandAction;
  update: (patch: Record<string, unknown>) => void;
}) {
  const [error, setError] = useState('');
  const updateStep = (id: string, values: Record<string, unknown>) =>
    update({ steps: action.steps.map((step) => (step.id === id ? { ...step, ...values } : step)) });
  return (
    <>
      <div className={s.twoColumns}>
        <label className={s.field}>
          <span>Shell</span>
          <select value={action.shell} onChange={(e) => update({ shell: e.target.value })}>
            <option value="cmd">Command Prompt</option>
            <option value="powershell">Windows PowerShell</option>
            <option value="pwsh">PowerShell 7</option>
          </select>
        </label>
        <label className={s.field}>
          <span>Execution mode</span>
          <select value={action.mode} onChange={(e) => update({ mode: e.target.value })}>
            <option value="steps">Ordered commands</option>
            <option value="script">One shared script</option>
          </select>
        </label>
      </div>
      <PathField label="Working directory" value={action.cwd} onChange={(cwd) => update({ cwd })} />
      {action.mode === 'steps' ? (
        <>
          <p className={s.helper}>
            Each command runs in a fresh shell. The next waits for it to finish. Use script mode to
            share <code>cd</code> or activation state.
          </p>
          {action.steps.map((step, index) => (
            <div className={s.commandStep} key={step.id}>
              <div className={s.stepHeading}>
                <span className={s.stepNumber}>{index + 1}</span>
                <input
                  aria-label={`Command ${index + 1} name`}
                  value={step.name}
                  onChange={(e) => updateStep(step.id, { name: e.target.value })}
                  maxLength={120}
                  required
                />
                <button
                  type="button"
                  className={s.iconButton}
                  title="Move command up"
                  disabled={!index}
                  onClick={() => {
                    const steps = [...action.steps];
                    [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
                    update({ steps });
                  }}
                >
                  <Icon name="up" size={16} />
                </button>
                <button
                  type="button"
                  className={s.iconButton}
                  title="Remove command"
                  onClick={() => update({ steps: action.steps.filter((x) => x.id !== step.id) })}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <label className={s.field}>
                <span>Command</span>
                <input
                  className={s.mono}
                  value={step.command}
                  placeholder="npm run build"
                  onChange={(e) => updateStep(step.id, { command: e.target.value })}
                  required
                  maxLength={8000}
                />
              </label>
              <div className={s.stepOptions}>
                <label>
                  Timeout{' '}
                  <input
                    type="number"
                    min="1"
                    max="3600"
                    value={step.timeoutSeconds}
                    onChange={(e) =>
                      updateStep(step.id, { timeoutSeconds: Number(e.target.value) })
                    }
                  />{' '}
                  seconds
                </label>
                <label className={s.checkbox}>
                  <input
                    type="checkbox"
                    checked={step.continueOnError}
                    onChange={(e) => updateStep(step.id, { continueOnError: e.target.checked })}
                  />{' '}
                  Continue after failure
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            className={s.secondary}
            onClick={() =>
              update({
                steps: [
                  ...action.steps,
                  {
                    id: uid(),
                    name: `Command ${action.steps.length + 1}`,
                    command: '',
                    timeoutSeconds: 60,
                    continueOnError: false,
                  },
                ],
              })
            }
          >
            <Icon name="plus" size={16} /> Add command
          </button>
        </>
      ) : (
        <>
          <div className={s.inlineHeading}>
            <span>Script content</span>
            <button
              type="button"
              className={s.textButton}
              onClick={() => {
                void window.instastart
                  .readScript()
                  .then((script) => {
                    if (script !== null) update({ script });
                  })
                  .catch((e) => setError(String(e)));
              }}
            >
              Import script…
            </button>
          </div>
          <textarea
            aria-label="Script content"
            className={s.script}
            rows={8}
            value={action.script}
            onChange={(e) => update({ script: e.target.value })}
            placeholder={'@echo off\ncall npm.cmd run build\nif errorlevel 1 exit /b 1\necho Ready'}
            required
          />
          <p className={s.helper}>
            This script shares one shell session. Include failure checks between commands. In batch
            scripts, use <code>call</code> for other .cmd/.bat files.
          </p>
          <label className={s.field}>
            <span>Script timeout in seconds</span>
            <input
              type="number"
              min="1"
              max="3600"
              value={action.timeoutSeconds}
              onChange={(e) => update({ timeoutSeconds: Number(e.target.value) })}
            />
          </label>
        </>
      )}
      {error && <p className={s.errorText}>{error}</p>}
      <details className={s.advanced}>
        <summary>Environment variables</summary>
        <EnvField value={action.env} onChange={(env) => update({ env })} />
      </details>
    </>
  );
}
export function Editor({
  original,
  onClose,
  onSave,
}: {
  original: Workspace;
  onClose: () => void;
  onSave: (w: Workspace) => Promise<void>;
}) {
  const [w, setW] = useState<Workspace>(structuredClone(original));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const update = (id: string, patch: Record<string, unknown>) =>
    setW((old) => ({
      ...old,
      actions: old.actions.map((a) => (a.id === id ? ({ ...a, ...patch } as Action) : a)),
    }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = workspaceSchema.safeParse(w);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('\n'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(parsed.data);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={s.overlay}>
      <form
        className={s.editor}
        onSubmit={(e) => {
          void submit(e);
        }}
        aria-label="Workspace editor"
      >
        <header className={s.modalHeader}>
          <div>
            <span className={s.eyebrow}>
              {original.revision ? 'WORKSPACE SETTINGS' : 'A FRESH START'}
            </span>
            <h2>{original.revision ? 'Edit workspace' : 'Create your workspace'}</h2>
          </div>
          <button
            type="button"
            className={s.iconButton}
            aria-label="Close editor"
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </header>
        <div className={s.editorBody}>
          <div className={s.twoColumns}>
            <label className={s.field}>
              <span>Workspace name</span>
              <input
                autoFocus
                required
                maxLength={120}
                value={w.name}
                placeholder="My next great project"
                onChange={(e) => setW({ ...w, name: e.target.value })}
              />
            </label>
            <label className={s.field}>
              <span>Color</span>
              <select
                value={w.color}
                onChange={(e) => setW({ ...w, color: e.target.value as Workspace['color'] })}
              >
                <option value="mint">Mint</option>
                <option value="blue">Sky</option>
                <option value="peach">Peach</option>
                <option value="lavender">Lavender</option>
              </select>
            </label>
          </div>
          <PathField
            label="Project folder"
            value={w.rootPath}
            onChange={(rootPath) => setW({ ...w, rootPath })}
          />
          <label className={s.field}>
            <span>
              Description <small>optional</small>
            </span>
            <input
              maxLength={500}
              value={w.description}
              placeholder="A little context for your next session"
              onChange={(e) => setW({ ...w, description: e.target.value })}
            />
          </label>
          <div className={s.sectionDivider}>
            <h3>What should open?</h3>
            <span>{w.actions.length} resources</span>
          </div>
          <div className={s.addActions}>
            {(['ide', 'browser', 'path', 'app', 'commands'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  const action = newAction(type);
                  setW({ ...w, actions: [...w.actions, action] });
                  setExpanded(action.id);
                }}
              >
                <Icon name={icons[type]} size={17} />
                {labels[type]}
              </button>
            ))}
          </div>
          {!w.actions.length && (
            <div className={s.editorEmpty}>
              Add the apps, links, and commands that belong to this project.
            </div>
          )}
          {w.actions.map((a, i) => (
            <section className={s.actionEditor} key={a.id}>
              <div className={s.actionEditorTitle}>
                <button
                  type="button"
                  className={s.expandButton}
                  onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                  aria-expanded={expanded === a.id}
                >
                  <Icon name={icons[a.type]} size={19} />
                  <strong>{a.name}</strong>
                  <span>{labels[a.type]}</span>
                  <Icon name={expanded === a.id ? 'up' : 'down'} size={16} />
                </button>
                <button
                  type="button"
                  className={s.iconButton}
                  title="Move resource up"
                  disabled={!i}
                  onClick={() => {
                    const actions = [...w.actions];
                    [actions[i - 1], actions[i]] = [actions[i], actions[i - 1]];
                    setW({ ...w, actions });
                  }}
                >
                  <Icon name="up" size={16} />
                </button>
                <button
                  type="button"
                  className={s.iconButton}
                  title="Remove resource"
                  onClick={() =>
                    setW({
                      ...w,
                      actions: w.actions
                        .filter((x) => x.id !== a.id)
                        .map((x) => ({ ...x, dependsOn: x.dependsOn.filter((id) => id !== a.id) })),
                    })
                  }
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
              {expanded === a.id && (
                <div className={s.actionEditorBody}>
                  <label className={s.field}>
                    <span>Resource label</span>
                    <input
                      value={a.name}
                      required
                      maxLength={120}
                      onChange={(e) => update(a.id, { name: e.target.value })}
                    />
                  </label>
                  {a.type === 'ide' && (
                    <>
                      <label className={s.field}>
                        <span>IDE</span>
                        <select
                          value={a.app}
                          onChange={(e) => update(a.id, { app: e.target.value })}
                        >
                          <option value="vscode">Visual Studio Code</option>
                          <option value="intellij">IntelliJ IDEA</option>
                        </select>
                      </label>
                      <PathField
                        label="Project path"
                        value={a.path}
                        onChange={(value) => update(a.id, { path: value })}
                      />
                      {a.app === 'vscode' && (
                        <label className={s.checkbox}>
                          <input
                            type="checkbox"
                            checked={a.newWindow}
                            onChange={(e) => update(a.id, { newWindow: e.target.checked })}
                          />{' '}
                          Open a new VS Code window
                        </label>
                      )}
                    </>
                  )}
                  {a.type === 'browser' && (
                    <>
                      <label className={s.field}>
                        <span>
                          Google Chrome links <small>one http/https URL per line</small>
                        </span>
                        <textarea
                          rows={4}
                          value={a.urls.join('\n')}
                          onChange={(e) => update(a.id, { urls: e.target.value.split('\n') })}
                          required
                        />
                      </label>
                      <div className={s.twoColumns}>
                        <label className={s.field}>
                          <span>
                            Chrome profile directory <small>optional</small>
                          </span>
                          <input
                            value={a.profile}
                            placeholder="Default or Profile 1"
                            onChange={(e) => update(a.id, { profile: e.target.value })}
                          />
                        </label>
                        <label className={s.checkbox}>
                          <input
                            type="checkbox"
                            checked={a.newWindow}
                            onChange={(e) => update(a.id, { newWindow: e.target.checked })}
                          />{' '}
                          Open a new Chrome window
                        </label>
                      </div>
                    </>
                  )}
                  {a.type === 'path' && (
                    <>
                      <label className={s.field}>
                        <span>Open as</span>
                        <select
                          value={a.kind}
                          onChange={(e) => update(a.id, { kind: e.target.value })}
                        >
                          <option value="file">File / notes (default app)</option>
                          <option value="folder">Folder</option>
                        </select>
                      </label>
                      <PathField
                        label={a.kind === 'file' ? 'File path' : 'Folder path'}
                        kind={a.kind}
                        value={a.path}
                        onChange={(value) => update(a.id, { path: value })}
                      />
                    </>
                  )}
                  {a.type === 'app' && (
                    <>
                      <PathField
                        label="Application executable"
                        kind="executable"
                        value={a.executable}
                        onChange={(value) => update(a.id, { executable: value })}
                      />
                      <PathField
                        label="Working directory"
                        value={a.cwd}
                        onChange={(cwd) => update(a.id, { cwd })}
                      />
                      <label className={s.field}>
                        <span>
                          Arguments <small>one argument per line; no surrounding quotes</small>
                        </span>
                        <textarea
                          rows={3}
                          value={a.args.join('\n')}
                          onChange={(e) =>
                            update(a.id, { args: e.target.value.split('\n').filter(Boolean) })
                          }
                        />
                      </label>
                    </>
                  )}
                  {a.type === 'commands' && (
                    <CommandFields action={a} update={(patch) => update(a.id, patch)} />
                  )}
                  <details className={s.advanced}>
                    <summary>Order and behavior</summary>
                    <p className={s.helper}>
                      Independent resources can launch together. Select prerequisites to wait for
                      their successful completion.
                    </p>
                    <div className={s.dependencies}>
                      {w.actions
                        .filter((x) => x.id !== a.id && x.enabled)
                        .map((x) => (
                          <label className={s.checkbox} key={x.id}>
                            <input
                              type="checkbox"
                              checked={a.dependsOn.includes(x.id)}
                              onChange={(e) =>
                                update(a.id, {
                                  dependsOn: e.target.checked
                                    ? [...a.dependsOn, x.id]
                                    : a.dependsOn.filter((id) => id !== x.id),
                                })
                              }
                            />{' '}
                            After {x.name}
                          </label>
                        ))}
                    </div>
                    <div className={s.stepOptions}>
                      <label className={s.checkbox}>
                        <input
                          type="checkbox"
                          checked={a.enabled}
                          onChange={(e) => update(a.id, { enabled: e.target.checked })}
                        />{' '}
                        Enabled
                      </label>
                      <label className={s.checkbox}>
                        <input
                          type="checkbox"
                          checked={a.optional}
                          onChange={(e) => update(a.id, { optional: e.target.checked })}
                        />{' '}
                        Skip if missing
                      </label>
                    </div>
                  </details>
                </div>
              )}
            </section>
          ))}
          {error && (
            <div className={s.errorBox} role="alert">
              {error}
            </div>
          )}
        </div>
        <footer className={s.modalFooter}>
          <p>Saved on this computer. Launch when you’re ready.</p>
          <button type="button" className={s.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={s.primary} disabled={saving}>
            {saving ? 'Saving…' : 'Save workspace'}
            <Icon name="check" size={17} />
          </button>
        </footer>
      </form>
    </div>
  );
}
