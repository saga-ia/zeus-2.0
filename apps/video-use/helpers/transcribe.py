"""Transcribe a video LOCALLY with faster-whisper. No API key, no cost, offline.

Drop-in replacement for the original ElevenLabs Scribe helper (kept next to
this file as transcribe_scribe.py for reference). It writes the SAME JSON
shape to <edit_dir>/transcripts/<video_stem>.json, so every other helper
keeps working untouched -- pack_transcripts.py reads `words` with types
word/spacing/audio_event, render.py --build-subtitles reads the `word`
entries. Nothing downstream knows the engine changed.

    {"words": [{"text": "Hello", "start": 1.20, "end": 1.55,
                "type": "word", "speaker_id": "speaker_0"},
               {"text": " ", "start": 1.55, "end": 1.61,
                "type": "spacing", "speaker_id": "speaker_0"}]}

WHY LOCAL: Scribe bills per minute of audio, and on this machine the
ElevenLabs account belongs to a client. Whisper on the CPU costs nothing.

WHAT WE LOSE vs Scribe -- know this BEFORE planning an edit:

  - Diarization. Whisper does not know who is speaking; every token is
    tagged "speaker_0". For a single talking head that changes nothing.
    For a two-person interview, pack_transcripts.py loses its
    speaker-change phrase breaks -- it still breaks on silence.
  - Audio events. Scribe tags "(laughs)", "(applause)". Whisper does not,
    so those beat signals are absent from the transcript. Silence gaps are
    still there, and they are the primary cut signal anyway.
  - Fillers. Scribe verbatim keeps every "uh"; Whisper cleans some up.
    `condition_on_previous_text=False` limits the damage. When retake
    detection matters for a job, --hint pushes it back toward verbatim.
  - Speed. Roughly 1x realtime on CPU: a 10-minute video takes ~10 minutes.

WHAT WE KEEP -- and it is what the cut engine actually reads: word-level
timestamps and sub-second gap data.

NO FFMPEG NEEDED HERE. faster-whisper decodes the audio through PyAV, so
this step works even when ffmpeg is missing from PATH. The rest of the skill
(render.py, grade.py, timeline_view.py) does still require ffmpeg.

Usage:
    python helpers/transcribe.py <video_path>
    python helpers/transcribe.py <video_path> --edit-dir /custom/edit
    python helpers/transcribe.py <video_path> --language pt
    python helpers/transcribe.py <video_path> --model large-v3
    python helpers/transcribe.py <video_path> --hint      # keep disfluencies
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
from pathlib import Path

# 'medium' is already on disk on this machine (~1.5 GB). 'large-v3' is more
# accurate and downloads ~3 GB on first use; 'small' is ~3x faster and wrong
# more often -- in Portuguese it turned "trunks" into "prompts".
DEFAULT_MODEL = os.environ.get("VIDEO_USE_MODEL", "medium")

# A hint that discourages Whisper from tidying speech into clean prose. Off by
# default because it can bleed its own wording into the output; turn it on with
# --hint when retake and filler detection matter more than tidy text.
VERBATIM_HINT = (
    "Transcricao literal, palavra por palavra, "
    "mantendo hesitacoes, repeticoes e gaguejos."
)

SAMPLE_RATE = 16000

# How the silence pass is tuned. The skill treats gaps >= 400ms as the cleanest
# cut targets and 150-400ms as usable, so the detector has to resolve well below
# 150ms or those candidates never reach the editor. The pad keeps a consonant
# onset from being clipped; the skill pads every cut edge again on its own.
VAD_SILENCE_MS = 120
VAD_PAD_MS = 30

_MODELS: dict[tuple, object] = {}
_MODEL_LOCK = threading.Lock()

# ONE transcription at a time, on purpose. transcribe_batch.py spawns 4
# workers; four CPU Whisper runs fight for the same cores (no speedup) and
# hold four copies of the model in RAM (~6 GB at 'medium'). Serializing here
# keeps `--workers 4` safe instead of making it a crash, and one run using all
# cores finishes sooner than four runs sharing them.
_RUN_LOCK = threading.Lock()


def load_api_key() -> str:
    """Kept so transcribe_batch.py imports cleanly. There is no key any more."""
    return ""


def _load_model(name: str, device: str, compute_type: str):
    key = (name, device, compute_type)
    with _MODEL_LOCK:
        if key not in _MODELS:
            from faster_whisper import WhisperModel

            print(
                f"  . loading model '{name}' ({device}/{compute_type}) "
                f"-- first run downloads it, then it is instant",
                flush=True,
            )
            _MODELS[key] = WhisperModel(
                name,
                device=device,
                compute_type=compute_type,
                cpu_threads=os.cpu_count() or 4,
            )
        return _MODELS[key]


def _speech_regions(audio) -> list[tuple[float, float]]:
    """Where speech actually is, in seconds, measured by Silero VAD.

    WHY THIS EXISTS -- do not remove it as an optimization. Whisper tiles word
    timestamps with no gaps: each word's `start` equals the previous word's
    `end`, even across a real pause. Measured on a 25s clip, 51 of 52 word
    pairs came back touching. Shipped that way, `spacing` entries never appear,
    pack_transcripts.py collapses the whole take into one phrase, and the
    editor has no cut candidates at all. It is a failure that looks like
    success: the transcript text is perfectly correct.
    """
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    opts = VadOptions(
        min_silence_duration_ms=VAD_SILENCE_MS,
        speech_pad_ms=VAD_PAD_MS,
    )
    return [
        (r["start"] / SAMPLE_RATE, r["end"] / SAMPLE_RATE)
        for r in get_speech_timestamps(audio, opts, sampling_rate=SAMPLE_RATE)
    ]


def _snap(start: float, end: float, regions: list[tuple[float, float]]) -> tuple[float, float]:
    """Clip one word to the speech it overlaps, so real silence becomes a gap.

    Only ever shrinks an interval, which is what keeps consecutive words from
    ending up overlapped after the snap.
    """
    if not regions:
        return start, end
    hits = [r for r in regions if r[1] > start and r[0] < end]
    if not hits:
        return start, end
    new_start = max(start, hits[0][0])
    new_end = min(end, hits[-1][1])
    if new_end - new_start < 0.02:   # never let a word collapse into nothing
        return start, end
    return new_start, new_end


def _to_scribe_shape(
    segments,
    info,
    model_name: str,
    regions: list[tuple[float, float]] | None = None,
    speaker: str = "speaker_0",
) -> dict:
    """Turn faster-whisper output into the JSON the rest of the skill reads.

    Every inter-word gap becomes an explicit `spacing` entry, because that is
    where pack_transcripts.py reads silence from -- it breaks a phrase when a
    spacing entry lasts >= the threshold. Dropping them would collapse a whole
    take into one unusable phrase and there would be no cut candidates left.
    """
    words: list[dict] = []
    text_parts: list[str] = []
    prev_end: float | None = None

    for seg in segments:
        for w in seg.words or []:
            token = (w.word or "").strip()
            if not token:
                continue
            start, end = _snap(float(w.start), float(w.end), regions or [])

            # the silence that came before this word
            if prev_end is not None and start > prev_end:
                words.append(
                    {
                        "text": " ",
                        "start": round(prev_end, 3),
                        "end": round(start, 3),
                        "type": "spacing",
                        "speaker_id": speaker,
                    }
                )

            words.append(
                {
                    "text": token,
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "type": "word",
                    "speaker_id": speaker,
                    "logprob": round(float(getattr(w, "probability", 0.0)), 4),
                }
            )
            text_parts.append(token)
            prev_end = end

    return {
        "language_code": getattr(info, "language", None),
        "language_probability": round(float(getattr(info, "language_probability", 0.0) or 0.0), 4),
        "text": " ".join(text_parts),
        "words": words,
        # metadata, so a transcript never lies about where it came from
        "engine": "faster-whisper",
        "model": model_name,
        "diarization": False,
        "audio_events": False,
    }


def transcribe_one(
    video: Path,
    edit_dir: Path,
    api_key: str | None = None,   # ignored; kept for signature compatibility
    language: str | None = None,
    num_speakers: int | None = None,
    verbose: bool = True,
    model: str = DEFAULT_MODEL,
    device: str = "cpu",
    compute_type: str = "int8",
    hint: bool = False,
) -> Path:
    """Transcribe a single video locally. Returns path to the transcript JSON.

    Cached: returns the existing path immediately if the transcript exists.
    """
    transcripts_dir = edit_dir / "transcripts"
    transcripts_dir.mkdir(parents=True, exist_ok=True)
    out_path = transcripts_dir / f"{video.stem}.json"

    if out_path.exists():
        if verbose:
            print(f"cached: {out_path.name}")
        return out_path

    if num_speakers and verbose:
        print(
            "  ! --num-speakers ignored: the local engine does not diarize. "
            "Every token is tagged speaker_0.",
            flush=True,
        )

    if verbose:
        print(f"  transcribing {video.name} locally (no upload, no cost)", flush=True)

    t0 = time.time()
    whisper = _load_model(model, device, compute_type)

    from faster_whisper.audio import decode_audio

    # Decode ONCE (PyAV, no ffmpeg) and reuse the samples for both the
    # transcription and the silence pass, so the two can never disagree about
    # what the audio is.
    audio = decode_audio(str(video), sampling_rate=SAMPLE_RATE)

    with _RUN_LOCK:
        segments, info = whisper.transcribe(
            audio,
            language=language,
            beam_size=5,
            word_timestamps=True,     # the whole point: word-boundary cuts
            vad_filter=True,          # trims silence, stops hallucination in dead air
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=False,  # one bad line must not poison the next
            initial_prompt=VERBATIM_HINT if hint else None,
        )
        segments = list(segments)
        regions = _speech_regions(audio)
        payload = _to_scribe_shape(segments, info, model, regions=regions)

    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    dt = time.time() - t0

    if verbose:
        kb = out_path.stat().st_size / 1024
        n_words = sum(1 for w in payload["words"] if w["type"] == "word")
        print(f"  saved: {out_path.name} ({kb:.1f} KB) in {dt:.1f}s")
        print(f"    words: {n_words}  language: {payload['language_code']}")

    return out_path


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Transcribe a video locally with faster-whisper (no API key, no cost)"
    )
    ap.add_argument("video", type=Path, help="Path to a video or audio file")
    ap.add_argument(
        "--edit-dir",
        type=Path,
        default=None,
        help="Edit output directory (default: <video_parent>/edit)",
    )
    ap.add_argument(
        "--language",
        type=str,
        default=None,
        help="Optional ISO language code (e.g. 'pt', 'en'). Omit to auto-detect.",
    )
    ap.add_argument(
        "--num-speakers",
        type=int,
        default=None,
        help="Accepted and ignored: the local engine does not diarize.",
    )
    ap.add_argument(
        "--model",
        type=str,
        default=DEFAULT_MODEL,
        help=f"Whisper model (default: {DEFAULT_MODEL}). 'large-v3' is better and slower.",
    )
    ap.add_argument("--device", type=str, default="cpu", help="cpu or cuda (default: cpu)")
    ap.add_argument(
        "--compute-type", type=str, default="int8", help="int8 (cpu) or float16 (cuda)"
    )
    ap.add_argument(
        "--hint",
        action="store_true",
        help="Nudge the model to keep hesitations and repetitions (helps retake detection)",
    )
    args = ap.parse_args()

    video = args.video.resolve()
    if not video.exists():
        sys.exit(f"video not found: {video}")

    edit_dir = (args.edit_dir or (video.parent / "edit")).resolve()

    transcribe_one(
        video=video,
        edit_dir=edit_dir,
        language=args.language,
        num_speakers=args.num_speakers,
        model=args.model,
        device=args.device,
        compute_type=args.compute_type,
        hint=args.hint,
    )


if __name__ == "__main__":
    main()
