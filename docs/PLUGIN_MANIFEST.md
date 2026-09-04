# AIYOU menu plugins

AIYOU's left navigator supports two local extension formats:

1. A Codex plugin directory containing `.codex-plugin/plugin.json`. Use **Settings → 菜单插件 →
   安装 Codex 插件目录**; AIYOU validates and copies it into the app user-data directory.
2. A legacy declarative `.json` menu manifest placed in **打开插件目录**.

Invalid manifests, duplicate built-in IDs, escaping relative paths and non-HTTP external URLs are
rejected or omitted. Installed Codex plugin bundles can be enabled/disabled and moved to Trash from
Settings.

Minimal Codex plugin example:

```json
{
  "name": "team-tools",
  "version": "1.0.0",
  "description": "Reusable team workflows",
  "author": { "name": "Team" },
  "skills": "./skills",
  "interface": {
    "displayName": "团队工具",
    "shortDescription": "团队 Skills 与工作流",
    "capabilities": ["Skills"]
  }
}
```

The directory name must match `name`. Enabled `skills` roots are registered with Codex App Server
through `skills/extraRoots/set` and reloaded through `skills/list`.

Legacy menu example:

Example:

```json
{
  "id": "team-dashboard",
  "name": "团队控制台",
  "description": "打开团队的模型使用看板",
  "icon": "link",
  "group": "workspace",
  "placement": "both",
  "enabled": true,
  "command": "open-url",
  "url": "https://example.com/ai-dashboard",
  "shortcut": "⌘ 8"
}
```

Allowed icons: `blocks`, `skills`, `assets`, `automation`, `terminal`, `link`.

Allowed placements:

- `quick`: the shortcut card area.
- `menu`: the plugin popover.
- `both`: both surfaces.

Allowed commands: `new-task`, `projects`, `skills`, `assets`, `automation`, `open-url`, `plugin`.
External manifests are UI capabilities only. They do not execute JavaScript, load Electron modules,
read workspaces, or access decrypted provider credentials. `open-url` is handed to the main process,
which only accepts HTTP/HTTPS URLs.

The App Server's marketplace `plugin/list/install/uninstall` methods are explicitly documented as
under development, so AIYOU 0.3.2 does not use them in the production client. MCP servers and Apps
already configured in Codex are shown through stable runtime list methods; a bundle's declarations
are displayed, but are not falsely reported as activated unless App Server actually returns them.
