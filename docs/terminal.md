# Integrated Terminal

CodeX uses `xterm` in the renderer and `node-pty` in the Electron main process for local integrated terminals.

## Behavior

- Terminals are local PTY sessions.
- New sessions start in the active project path when available, otherwise the user home directory.
- Terminal links only open through the safe URL schemes allowed by the main process.
- Closing a terminal tab disposes the xterm instance and kills the backing PTY.

## Troubleshooting

- If a terminal exits, close the tab and create a new session.
- If terminal output stops, check whether the PTY exited or the project path is no longer valid.
- Remote filesystem sessions are not SSH-backed terminals in this pass; terminal sessions remain local.

## Safety Rules

- Renderer-provided terminal dimensions are clamped before resize.
- Unsafe URL schemes are blocked before opening externally.
- Terminal cleanup is idempotent so repeated close/kill calls do not leak processes.
