# NOTICE — Licences and attribution (ROCKY AI v5)

## sherpa-onnx (Apache-2.0)

Speech engine for ROCKY Voice. Copyright Xiaomi Corporation and
contributors. AAR `sherpa-onnx-1.12.0.aar` pinned in `android/app/libs/`,
sha256 verified against the v1.12.0 release `checksum.txt`.
Source: https://github.com/k2-fsa/sherpa-onnx (Apache-2.0).

## Piper voice model: en_GB-alan-low-int8

Neural voice model files in `android/app/src/main/assets/voice/`
(`en_GB-alan-low.onnx`, `tokens.txt`) plus `espeak-ng-data.zip`, obtained
from the sherpa-onnx `tts-models` release (which redistributes Piper
voices). Model card (from the bundle): English (Great Britain), 1
speaker, 16 kHz, low quality, dataset via Mycroft mimic3-voices
`en_UK/apope_low` — licence as stated on that dataset page
(https://github.com/MycroftAI/mimic3-voices/blob/master/voices/en_UK/apope_low).
Piper itself: https://github.com/rhasspy/piper (MIT for the Piper code;
voice dataset licences vary by voice — Alan's is as above, not
re-asserted here as MIT).

## JARVIS-OS-V.2 (MIT)

Architectural reference and adapted patterns only: planner discipline,
RETRY/SKIP/REPLAN/ABORT error recovery, deep-research depth tiers +
cancellation, safe-root file control + stamps, rate-limit failover,
capped task history, prompt routing structure. Ported to Kotlin by
adapting the logic; no JARVIS Python code is copied verbatim into the
APK, and its identity, phrases, PyQt6 UI and desktop tools were NOT
ported. Source: https://github.com/MAL19INDUSTRIES/JARVIS-OS-V.2 (MIT).
Copyright notice for reused patterns: Copyright (c) MAL19INDUSTRIES,
MIT licence.

## Google Filament (Apache-2.0) — evaluated only, NOT shipped

Filament (filament-android / gltfio-android / filament-utils-android)
was evaluated for v5 and deferred (see BUILD_REPORT engine decision).
No Filament code ships in v5. Source: https://github.com/google/filament
(Apache-2.0).

## ROCKY's own code

All other ROCKY code (head geometry, viseme mapping, identity prompt,
agent runtime, UI) is original to this project. The launcher icon and
splash art are original generated assets for ROCKY AI.
