# Studio

> `vanillasky studio video.json` opens the bundled visual editor on your own machine. Use it to review the agent's draft, refine the video, and export the final MP4 without uploading the config or creating an account.

```bash
vanillasky studio video.json
```

Studio opens at `http://127.0.0.1:<port>/studio`. The scene timeline, variables, music, preview, file writes, and export all run locally.

## Edit visually, without giving up agent control

![VanillaSky Studio with editable scene controls, live portrait preview, timeline, and export](https://vanillasky.ai/docs-assets/studio.webp)

Select a scene in the timeline to edit the selected scene's copy, timing, background, template, and style while the real video plays beside it. The visual editor and `video.json` stay in sync, so Studio is a review surface—not a separate rebuild of the agent's work.

## Why Studio is the handoff

Rendering an MP4 just to discover that the hook is weak or a title wraps badly is a slow feedback loop. Studio shows the composed video immediately and makes the final creative decisions visible before export.

The intended collaboration is:

1. The agent composes, validates, and inspects `video.json`.
2. Studio opens that exact file for the user.
3. The agent can keep changing the config while the user watches.
4. The user exports only when the video is ready.

## What you can change

- **Scenes** — reorder, delete, duplicate, and retime scenes from the timeline. Selecting a scene seeks the preview to it.
- **Copy and variables** — edit every variable declared by the selected template using the correct control for its type.
- **Templates** — swap a scene's template. Shared copy carries across; incompatible variables are removed.
- **Background media** — use direct media or search Pexels with your own API key.
- **Music** — choose from the bundled library. Short tracks are marked as looping rather than rejected.
- **Brand and orientation** — change font, brand colors, and portrait or landscape output.

## Export the MP4

Choose **Export MP4** in Studio. Export uses headless Chrome and ffmpeg—the same deterministic renderer as `vanillasky render`—and writes `video.mp4` next to the config.

Export is disabled while a save is in flight or the config has validation errors. This prevents Studio from producing a file the CLI would reject.

If the footage was shot at 25fps, open Studio at the matching rate to avoid duplicated frames:

```bash
vanillasky studio video.json --fps 25
```

## Work alongside your agent

Studio watches the config file. When your agent rewrites it, the preview updates without a reload. Studio edits also autosave, so the agent always reads the current state.

If both sides change the file before Studio saves, a conflict banner offers **Use theirs** or **Keep mine**. Neither side silently wins.

## Choose the browser

Studio normally uses the system default browser. To open a specific browser:

```bash
vanillasky studio video.json --browser "Google Chrome"
```

Persist that choice in `~/.vanillasky/config.json`:

```json
{ "browser": "Google Chrome" }
```

In a remote shell, print the URL without trying to open a local application:

```bash
vanillasky studio video.json --no-open
```

## What the local Studio omits

- **No AI chat.** Your agent composes; Studio reviews and edits. This keeps the bundled editor backend-free.
- **No uploaded storage.** Reference media by HTTPS URL or local path, or search Pexels with your key.
- **No private ranking data.** The template picker uses the public registry order.

The hosted VanillaSky Studio at [vanillasky.ai/create](https://vanillasky.ai/create) includes the chat-first product experience. The bundled local Studio is the private, file-based handoff for the public agent skill.

## Local security

The CLI binds only to `127.0.0.1` on an ephemeral port and puts its session token in the URL fragment. Fragments are not sent in HTTP requests, and Studio removes the token from browser history after loading.

Every local API call checks the token, requires a loopback host, and verifies the request origin. Stop the server with `Ctrl+C`; only the config and exported video remain.
