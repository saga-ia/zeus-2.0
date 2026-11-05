---
name: video-use-install
description: Install video-use (Forge fork) into the current agent (Claude Code, Codex, Hermes, Openclaw, etc.) and wire up ffmpeg + the local faster-whisper transcription engine so the user can start editing immediately. No API key is involved.
---

> # ⚠️ THIS IS THE FORGE FORK — TRANSCRIPTION IS LOCAL, NOT ELEVENLABS
>
> Read this before following any step below.
>
> `helpers/transcribe.py` was replaced with a **local faster-whisper** engine.
> There is **no ElevenLabs key**, none is needed, and nothing about
> transcription costs money. **Step 5 below is dead** — it is kept only so the
> upstream guide stays readable. The original Scribe version sits beside it as
> `transcribe_scribe.py`, for reference only.
>
> What that changes for install:
>
> | thing | this fork |
> |---|---|
> | transcription | local `faster-whisper`, model `medium`, no key, offline |
> | API key | none — skip step 5 entirely |
> | ffmpeg | still required (step 3); on Windows: `winget install Gyan.FFmpeg --scope user` |
> | first transcription | downloads the model (~1.5 GB), once |
> | speed | ~1x realtime on CPU — a 10-min video takes ~10 min |
>
> What you give up, so you plan around it instead of discovering it mid-edit:
> **no diarization** (everything is `speaker_0`) and **no audio events**
> (no `(laughs)`, no `(applause)`). See `SKILL.md` →
> "Transcription engine (local, and why)".
>
> This fork also carries **4 Windows fixes** to the upstream helpers (UTF-8
> console, UTF-8 file I/O, the subtitle filter path, and the load-bearing VAD
> silence pass). `git pull upstream main` **will conflict on those files** —
> that is intentional. Re-apply ours; never accept theirs, or the four bugs
> come back and none of them announces itself.

---

# video-use install

Use this file only for first-time install or reconnect. For daily editing, read `SKILL.md`. Always read `helpers/` — that's where the scripts live.

## What you're doing

You're setting up a conversation-driven video editor for the user. After install, the user drops raw footage into any folder, runs their agent (`claude`, `codex`, etc.) there, and says "edit these into a launch video." You do the rest by reading `SKILL.md`.

Three things must exist on this machine:

1. The `video-use` repo cloned somewhere stable.
2. `ffmpeg` on `$PATH` (plus optional `yt-dlp` for online sources).
3. Python with `faster-whisper` installed — the local transcription engine. **No API key.**

And one thing must be true about the current agent:

4. It can discover `SKILL.md` — either via a global skills directory (`~/.claude/skills/`, `~/.codex/skills/`) or via a `CLAUDE.md` / system-prompt import.

## Install prompt contract

- Do everything yourself. There is nothing to ask the user for except confirmation before a package-manager install (`brew` / `winget` / `apt`). **Never ask for an API key** — this fork has none.
- Prefer a stable clone path like `~/Developer/video-use` (not `/tmp`, not `~/Downloads`).
- The skill references helpers by bare name (`transcribe.py`, `render.py`). That works because SKILL.md and `helpers/` ship together — keep them as siblings when you register the skill.
- After install, verify by running one real command against one real file. Don't declare success on file-existence checks alone.

## Steps

### 1. Clone to a stable path

```bash
test -d ~/Developer/video-use || git clone https://github.com/browser-use/video-use ~/Developer/video-use
cd ~/Developer/video-use
```

If the repo is already there, `git pull --ff-only` and continue.

### 2. Install Python deps

```bash
# Prefer uv if available; fall back to pip.
command -v uv >/dev/null && uv sync || pip install -e .
```

`pyproject.toml` lists `requests`, `librosa`, `matplotlib`, `pillow`, `numpy`
and — in this fork — **`faster-whisper`**, which is the transcription engine
and also ships the Silero VAD that `transcribe.py`'s silence pass depends on.
No console scripts — helpers are invoked directly as `python helpers/<name>.py`.

On Windows without `uv`, plain pip works:

```bash
python -m pip install -e .
```

### 3. Install ffmpeg (+ optional yt-dlp)

`ffmpeg` and `ffprobe` are hard requirements. `yt-dlp` is only needed if the user wants to pull sources from URLs. Animation engines such as HyperFrames, Remotion, and Manim are installed lazily the first time a project actually needs them.

```bash
# macOS
command -v ffmpeg >/dev/null || brew install ffmpeg
command -v yt-dlp >/dev/null || brew install yt-dlp     # optional

# Debian / Ubuntu
# sudo apt-get update && sudo apt-get install -y ffmpeg
# pip install yt-dlp

# Arch
# sudo pacman -S ffmpeg yt-dlp

# Windows (this is how it was installed on the Forge machine)
# winget install Gyan.FFmpeg --scope user
# winget install yt-dlp.yt-dlp --scope user     # optional
```

After a `winget` install, **open a new shell** — `PATH` is not refreshed in
the one that ran it, and `ffmpeg: command not found` right after a successful
install is that, not a failed install.

If `brew` / `apt` / `pacman` requires a sudo prompt, tell the user the exact command and wait. Do not invent a password.

### 4. Register the skill with the current agent

Figure out which agent you are running under, and register once. A symlink of the whole repo directory is the right shape — helpers/ needs to sit next to SKILL.md.

- **Claude Code** (`~/.claude/` present):

    ```bash
    mkdir -p ~/.claude/skills
    ln -sfn ~/Developer/video-use ~/.claude/skills/video-use
    ```

- **Codex** (`$CODEX_HOME` set, or `~/.codex/` present):

    ```bash
    mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
    ln -sfn ~/Developer/video-use "${CODEX_HOME:-$HOME/.codex}/skills/video-use"
    ```

- **Hermes / Openclaw / another agent with a skills directory**: symlink `~/Developer/video-use` into that agent's skills directory under the name `video-use`. If the agent has no skills directory, add a line to its system prompt / config pointing at `~/Developer/video-use/SKILL.md` (e.g. an `@~/Developer/video-use/SKILL.md` import in a `CLAUDE.md`-equivalent).

If you can't tell which agent you're in, ask the user once: "which agent am I running under — Claude Code, Codex, or something else?" Then pick the right target.

### 5. Transcription engine — LOCAL, no key (this replaces the upstream step)

⛔ **Do not ask the user for an ElevenLabs key.** There is nothing to paste and
nothing to pay. `helpers/transcribe.py` runs faster-whisper on this machine.

It is installed by step 2. Two things are worth doing now instead of during
the user's first edit:

1. **Pre-download the model**, so the first real transcription is not a silent
   10-minute wait on a 1.5 GB download:

    ```bash
    python -c "from faster_whisper import WhisperModel; WhisperModel('medium', device='cpu', compute_type='int8'); print('model ready')"
    ```

2. **Know the knobs.** Default model is `medium`. Override per run with
   `--model large-v3` (better, slower), or globally with the `VIDEO_USE_MODEL`
   environment variable. `--language pt` skips language detection.
   `--num-speakers` is accepted and ignored — there is no diarization.

The old Scribe path is preserved as `helpers/transcribe_scribe.py` and is
**not wired to anything**. Bringing it back means an `ELEVENLABS_API_KEY` and a
per-minute bill, in exchange for diarization and audio-event tags. Don't do it
by default — decide it deliberately, per job, and only when a two-speaker edit
actually needs speaker labels.

### 6. Verify end-to-end

Run one real thing. Prefer the lightest verification that still proves the pipeline is wired up:

```bash
python helpers/timeline_view.py --help >/dev/null && echo "helpers OK"
ffprobe -version | head -1
python -c "import faster_whisper; print('whisper OK')"
```

Then transcribe **one short real clip** (10–20s is enough) and open the JSON.
Unlike upstream, this costs nothing, so there is no reason to skip it — and it
is the only check that proves the part most likely to be broken:

```bash
python helpers/transcribe.py <some-short-clip.mp4>
```

In the resulting `transcripts/<name>.json`, confirm there is **at least one
`spacing` entry**. If every word starts exactly where the previous one ended
and there are no spacings, the VAD silence pass is not running — the text will
look perfect and the editor will have **zero cut candidates**. That is the
failure mode this fork exists to prevent.

### 7. Hand off

Tell the user, in one short message:

- Where the skill is installed (`~/Developer/video-use`).
- That they should `cd` into their footage folder and start their agent there (e.g. `claude`).
- That a good first message is: *"edit these into a launch video"* or *"inventory these takes and propose a strategy."*
- That all outputs land in `<videos_dir>/edit/` — the repo stays clean.

## Keeping the skill current

- `git pull upstream main` pulls the latest upstream code. **It will conflict** on `transcribe.py`, `render.py`, `grade.py`, `pack_transcripts.py`, `transcribe_batch.py`, `SKILL.md` and `install.md` — those are the fork's changes. Re-apply ours; never accept theirs.
- If `pyproject.toml` changed deps, re-run `uv sync` / `pip install -e .` after pulling.

## Cold-start reminders

- Symlink the **whole directory**, not just `SKILL.md`. The helpers need to sit next to it.
- `ffmpeg` from static builds works fine. Any modern (≥ 4.x) build is enough.
- `yt-dlp` is optional. Don't block install on it; install lazily the first time a user asks to pull from a URL.
- Node.js/npm are only needed for HyperFrames or Remotion slots. HyperFrames currently requires Node.js 22+.
- HyperFrames, Remotion, and Manim are optional animation engines. Don't install or prefer one globally during setup; pick the engine per animation slot in `SKILL.md`. HyperFrames can run through `npx --yes hyperframes ...` in the slot directory. Remotion can be scaffolded with `npx create-video@latest` or installed inside the slot before rendering.
- Transcription is free and local here, so **do** verify with one real short clip (see step 6). The upstream warning about burning Scribe credits does not apply to this fork.
- If the user is on Linux without a package manager Claude recognizes, print the manual `ffmpeg` install URL and wait rather than guessing.
