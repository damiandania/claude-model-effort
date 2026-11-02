# model-effort

A Claude Code mod that adds a compact, terminal-style bar above the prompt with two draggable sliders: one for the model, one for the effort.

```
[━━━●  •  •]  Sonnet 5.5   │   Medium  [━━━●  •  •  •]  ↺
```

- Moving a slider runs `/model <id>` or `/effort <level>`, so the session itself switches.
- Changes made elsewhere (the app's picker, `/model`, `/effort`) show up in the bar.
- Models are ordered cheapest to most capable; any model the session runs on joins the list.
- `/model-effort` shows or hides the bar.

Known limitation: in the desktop app, the model label under the prompt doesn't follow changes made with `/model` or `/effort`, so it can show a stale model while the session really runs another ([anthropics/claude-code#106639](https://github.com/anthropics/claude-code/issues/106639)). The bar shows the real one.

## Install

At the prompt of a terminal session:

```
/plugin install model-effort --marketplace damiandania/claude-model-effort
```

From a shell:

```bash
claude plugin install model-effort --marketplace damiandania/claude-model-effort
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `damiandania/claude-model-effort`, then Add plugin.
