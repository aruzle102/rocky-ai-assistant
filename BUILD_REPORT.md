# ROCKY AI v5 — Build Report

- **Repo:** https://github.com/aruzle102/rocky-ai-assistant
- **Branch:** main
- **App ID:** com.modaliadz.rocky — **App name:** ROCKY AI
- **Version:** 5.0 (versionCode 3, updates over v4's versionCode 2)
- **Stack:** native Kotlin + AndroidX AppCompat/Material + RecyclerView (XML
  layouts), OpenGL ES 3.0 head v2, Android SpeechRecognizer, Piper neural
  TTS via sherpa-onnx + system TTS fallback. No Node/npm/Capacitor. No Lovable.

## Why v5 exists (v4 rejected, not patched)

v4 (Release v4.0, 7.2 MB) was rejected by the user as a basic chatbot with
a particle-style face, a generic interface and a generic TTS voice. v5 is a
fundamental rebuild of the experience, not a restyle: full-screen character,
anatomical head with lips/visemes, cinematic intro, multi-view interface,
a measured deep male voice, and an identity fix (see below). Cosmetic
patches to v4 were explicitly refused, so v4's layout, head geometry and
voice routing were replaced.

## STEP 0 — Engine decision (written before implementation)

| Engine | Verdict | Exact reason |
|---|---|---|
| Unity | REJECTED for this pipeline | No Unity Editor on GitHub runners; installing it needs a multi-GB download, a Unity licence/activation, and Android SDK/NDK modules. It cannot be reproduced in the existing CI workflow, and there is no local editor in this environment to verify a build. |
| Unreal Engine | REJECTED for this pipeline | Same blocker, larger: UE editor + Android toolchain is tens of GB, needs a long first build, and cannot be reproduced in CI here. (A separate UE track exists for another product; it is not this app's pipeline.) |
| Google Filament (Maven: filament-android / gltfio-android / filament-utils-android, Apache-2.0, latest ~1.70+) | EVALUATED, DEFERRED | Maven artefacts exist and are buildable in CI. But Filament needs compiled `.filamat` materials or a glTF asset with materials to show anything, and no licensed rigged humanoid-head glTF was obtainable with a verified licence in this session (see Asset decision). Switching renderers without an asset would render the same procedural mesh through a heavier engine, plus an unverified native context on the emulator. Filament stays the documented next upgrade once a rigged asset is licensed; it was not adopted to pretend a renderer change is a quality change. |
| Native Android + OpenGL ES 3.0 (CHOSEN) | SHIPPED | Proven in this CI (v4 build green), full control of geometry/materials/lighting, no asset-pipeline dependency, works on the emulator's GLES path. v5's head is a new, denser anatomical mesh (see below), not v4's mesh restyled. |

## Asset decision (licence-checked)

- Khronos glTF Sample Models ("BrainStem"): evaluated — it is a stylised
  ROBOT, not a humanoid face, and would still need the Filament/glTF
  pipeline. Rejected as the wrong subject.
- Blender Studio characters (e.g. Sprite Fright, CC-BY 4.0): evaluated —
  they require Blender to rig/export to glTF, and Blender is not available
  in this environment or in CI. Rejected for pipeline reasons, not licence.
- MakeHuman (CC0): evaluated — it requires the MakeHuman generator to
  produce a head; the generator is not available here. Rejected for
  pipeline reasons.
- CHOSEN (explicitly permitted by the v5 order): a proper procedural head
  mesh built in code with real facial anatomy — forehead, brow ridge, nose
  bridge + tip + nostril bulges, philtrum, upper/lower lips, chin, jawline,
  cheekbones, ears, neck, shoulders — plus a separate jaw mesh and
  viseme-driven lips. No stock picture, no low-res face, no particle-cloud
  substitute. Particles are only the atmospheric halo.

## Voice: Piper neural TTS (measured, not assumed)

- Engine: sherpa-onnx 1.12.0 Android AAR, pinned in `android/app/libs/`,
  sha256 `e25961f914c8955c66dc9d47bc518d0a6a11763214d72e6e97762be51640da70`
  (verified against the v1.12.0 release `checksum.txt`). Java/Kotlin API
  pinned from the v1.12.0 tag source (OfflineTts / OfflineTtsConfig /
  OfflineTtsVitsModelConfig with model + tokens + espeak-ng-data).
- Voice: `en_GB-alan-low-int8` (Piper, via sherpa-onnx `tts-models`
  release). Model card: English (Great Britain), 1 speaker, 16 kHz,
  dataset via Mycroft mimic3-voices `en_UK/apope_low` (licence per that
  dataset page — see NOTICE). Sherpa code is Apache-2.0.
- **Measured depth (same sentence, same method, autocorrelation F0 on
  voiced 40 ms frames, 50–300 Hz range):**

  | Voice model | Median F0 | Mean F0 | Verdict |
  |---|---|---|---|
  | en_GB-alan-low-int8 (SHIPPED default) | **98.8 Hz** (p25 95.8, p75 101.3) | 98.4 Hz | Deep masculine |
  | en_US-norman-medium-int8 | 102.1 Hz | 113.7 Hz | Deep, wider spread |
  | en_US-ryan-low-int8 | 156.9 Hz | 160.9 Hz | Light male — rejected as default |
  | en_US-lessac-low-int8 | 200.0 Hz | 197.7 Hz | High — rejected |

  Samples were synthesised from the exact model files shipped in the APK
  (Piper binary, local VM). Nobody "listened" to them in this environment;
  the evidence is the measured F0 table above, and audible quality on the
  user's phone remains phone-required (see Limitations).
- Limits (stated in-app too): the bundled voice speaks ENGLISH only.
  Arabic/French replies use system TTS with a male-voice preference
  (Google TTS male-marked voices first). Piper gives audio samples, not
  phonemes or word ranges, so mouth motion is driven by real audio RMS
  plus text-derived visemes timed by audio duration — viseme-timed, NOT
  phoneme-perfect. System TTS gives word ranges, not phonemes (same
  disclosure as v4).
- Fallback: if Piper init or synthesis fails, the app uses system TTS and
  shows a notice; it never crashes on voice failure. Voice engine,
  pitch and rate are in Settings, with a Test voice button.

## Identity fix (root cause, not a slogan)

v4 bug: the system prompt was sent ONLY to keyed providers. The default
keyless provider (Pollinations) received the raw user prompt with no
identity and no history, so "What is your name?" was answered with the
underlying model's brand. v5 sends the ROCKY system prompt + history +
memory on EVERY path (keyed: system message; Pollinations: URL-encoded
text via `RockyIdentity`). The system prompt now states the name rule
explicitly ("Your name is ROCKY... never present the underlying model's
brand as your own identity").

**Real test (2026-10-25, VM, same prompt structure the app sends):**
Pollinations GET, identity prompt + "What is your name?" → HTTP 200,
answer: `ROCKY.` Unit tests pin the prompt construction
(`VoiceIdentityTest`: system prompt, Pollinations URL content, history
carriage, male-voice pick, visemes, Piper asset names). A live in-app
identity answer on the user's phone is still phone-required.

## What changed in v5

- **Head v2 (`HeadRenderer.kt`, rewritten):** denser anatomical mesh
  (36×56), lips as separate upper/lower meshes driven by visemes
  (`VisemeMapper`: Latin + Arabic grapheme mapping), eyelids that drop on
  blink, eyes that stay shut until the intro's eye-open phase, energy
  lines (brow/cheek/jaw/forehead circuit), shoulders, state colours for
  IDLE/LISTENING/THINKING/RESEARCHING/SPEAKING/EXECUTING/SUCCESS/ERROR,
  motion system (listening lean-in, thinking orbit, speaking jaw+visemes,
  success/error expression via mouth/brow).
- **Full-screen composition:** camera moved from z=6 to z=2.6 with a
  larger head; `activity_main.xml` is now a full-screen GLSurfaceView with
  translucent overlays, and navigation is a horizontal scroll bar so
  buttons cannot be clipped on narrow phones.
- **Cinematic intro:** 5 s choreography in the renderer — darkness,
  scattered particles converge, energy rings/lines fade in, face
  materialises with a camera push-in (z 7.0 → 2.6), eyes open at ~4 s —
  with the generated hum, a Skip button, and replay in Settings.
- **Multi-view interface:** cinematic home (full-screen head), Console
  (conversation log, notes, reminders, provider status), Research
  (last deep-research result + sources + open-first-source), Projects,
  Preview, Settings (providers, voice engine, memory, privacy, effects),
  provider health line on the home screen.
- **Voice routing (`MainActivity.speak`):** Piper first for English-dominant
  replies when engine=piper and Piper is ready; otherwise system TTS with
  male-voice preference. Interrupt (mic/send/Stop/Mute) stops both engines.
- **Tools (carried from v4, not re-audited from scratch):** JARVIS-ported
  planner discipline, RETRY/SKIP/REPLAN/ABORT recovery, deep-research
  depth tiers + cancellation, safe-root file control + stamps, rate-limit
  failover, capped task history (100), prompt routing structure. Website
  task = real files → validation → working preview → ZIP export, or it
  is reported incomplete. No npm/native-toolchain execution on-device;
  that limit is stated, not hidden.

## Build history (branch main, v5)

| Commit | Run | Result |
|---|---|---|
| <!-- V5-CODE-COMMIT --> | <!-- V5-RUN --> | <!-- V5-RUN-RESULT --> |

## Limitations — still needs the user's phone

- Audible Piper voice quality and depth as heard on his phone (F0 was
  measured on samples, not heard here), microphone recognition quality,
  face rendering on his device, provider access from Algeria, launcher
  appearance, and the full spoken restaurant flow.
- Emulator screenshot/demo jobs are best-effort only (previous runs:
  screenshot exit 2; demo emulator boot timeout, no-KVM boot 783 s).
  If they fail again, the exact failure is reported and the APK is still
  delivered — emulator evidence never blocks a stable APK.
- No feature is claimed working merely because its code exists. Anything
  above marked "measured" or "tested" names the test or measurement.

## Previous build (v4, for reference)

- Release v4.0: https://github.com/aruzle102/rocky-ai-assistant/releases/download/v4.0/ROCKY_AI.apk
  (7,211,367 bytes, build run 40142349835 green, 44/44 tests). Rejected by
  the user 2026-10-25 as a basic chatbot with a particle face and generic
  voice — superseded by v5, same package so v5 updates over it.
