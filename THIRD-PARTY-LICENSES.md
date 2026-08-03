# Third-party licenses — VanillaSky skill bundle

This bundle redistributes, or installs at `npm install` time, the third-party
work listed below. Each entry was verified against the installed package's
license metadata, not summarized from memory.

## Bundled in this artifact

### Google Noto emoji artwork (Apache-2.0)

The render app embeds a map of emoji PNGs (64px, base64 data URIs) taken from
the `emoji-datasource-google` npm package (package metadata: MIT, © Cal
Henderson). The artwork itself is Google's **Noto Emoji**, licensed under the
**Apache License 2.0**:
<https://github.com/googlefonts/noto-emoji/blob/main/LICENSE>

### Google Fonts (`cli/dist/fonts/`)

The bundled woff2 files are the Google Fonts families offered by the app's
font picker (Inter, Fira Code, and the display/serif/script faces). Each
family is served under its respective license — **SIL Open Font License 1.1**
or **Apache License 2.0** as published by its designer. Per-family license
metadata: <https://fonts.google.com/attribution>

### mediabunny (MPL-2.0)

The prebuilt render app in `cli/dist/` includes a compiled copy of
**mediabunny** (MP4 muxing), licensed under the **Mozilla Public License
2.0**: <https://www.mozilla.org/MPL/2.0/>
Per MPL-2.0 §3.2, the source code of the MPL-covered files is available at
<https://github.com/Vanilagy/mediabunny>. mediabunny is used in unmodified
form.

### React and other MIT-licensed dependencies

The compiled render app also includes **React**, **ReactDOM**,
**framer-motion**, and other npm dependencies distributed under the **MIT
license** (permissive; copyright notices preserved in the packages'
repositories).

### Audio tracks (`cli/audio/`)

The 12 bundled music tracks were generated with ElevenLabs under a paid plan
with commercial-use rights (see `cli/audio/tracks.json` metadata); they are
not third-party licensed artwork in the open-source sense.

## Installed at `npm install --prefix cli` time (not in this tarball)

### playwright-core (Apache-2.0)

Browser automation used to drive frame capture. Licensed under the **Apache
License 2.0**. It never downloads a browser itself; it attaches to a
Chromium/Chrome you provide.

### ffmpeg-static (GPL-3.0-or-later) and the ffmpeg binary (GPL v3)

`ffmpeg-static`'s npm package is declared **GPL-3.0-or-later**. Its
postinstall step downloads a **statically linked ffmpeg binary** (John Van
Sickle builds, compiled with `--enable-gpl --enable-version3`, including
libx264/libx265) — that binary is licensed under the **GNU General Public
License v3**. To be plain: the ffmpeg program your install uses is GPL
software.

The VanillaSky CLI (MIT) invokes ffmpeg strictly as a **separate process**
(`child_process.spawn` on the binary path) with no linking; this is
aggregation of independent programs, not a derivative work, so the GPL's
terms apply to the ffmpeg binary itself, not to the CLI. ffmpeg's corresponding
source is available at <https://ffmpeg.org/download.html> and the exact build
info ships next to the binary (`cli/node_modules/ffmpeg-static/ffmpeg.README`
and `ffmpeg.LICENSE` after install). You may instead point `FFMPEG_PATH` at
any ffmpeg build you prefer, including an LGPL-configured one.
