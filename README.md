# ROCKY AI — v5

A native Kotlin Android holographic AI assistant. ROCKY is the user's
personal AI assistant: calm, confident, concise when appropriate, and
context-aware. Its name is ROCKY on every provider path — if you ask
"What is your name?", the answer is ROCKY, not the underlying model's
brand (see BUILD_REPORT for the v4 identity bug and the v5 fix + real
test).

- **Repo:** https://github.com/aruzle102/rocky-ai-assistant
- **Branch:** main — **App ID:** `com.modaliadz.rocky` (kept, so v5 updates over v4)
- **App name:** ROCKY AI — **Version:** 5.0 (versionCode 3)
- **Stack:** Kotlin + AndroidX AppCompat/Material + RecyclerView, XML layouts
  (no Jetpack Compose, to keep the CI build deterministic), OpenGL ES 3.0
  `GLSurfaceView` + custom GLSL shaders for the head, Android
  `SpeechRecognizer`, Piper neural TTS via sherpa-onnx + system TTS fallback
- **Build:** GitHub Actions (cloud) — see `.github/workflows/android.yml`
- **Pinned:** compileSdk 34, minSdk 26, targetSdk 34, Java 17, AGP 8.2.1,
  Kotlin 1.9.24, sherpa-onnx 1.12.0 (AAR, sha256-verified). No Node/npm/
  Capacitor steps. No Lovable, no paid services, no bundled secrets.

## What v5 is

- **A real 3D character, full-screen:** an anatomical head mesh
  (forehead, brow, nose, lips, chin, jawline, cheekbones, ears, neck,
  shoulders) with viseme-driven lips, blinking eyelids, gaze, expressions
  and a state-colour motion system. Particles are only atmosphere.
  Cinematic 5 s intro (particles converge, face materialises, camera
  push-in, eyes open) with Skip and replay.
- **A deep male voice, measured:** ROCKY Voice is Piper
  `en_GB-alan-low-int8` running offline on-device via sherpa-onnx.
  Its depth was measured, not assumed: median F0 98.8 Hz on the test
  sentence (Ryan measured 156.9 Hz, Lessac 200.0 Hz — both rejected as
  default). English only; Arabic/French use system TTS with a
  male-voice preference. Mouth motion is driven by real Piper audio
  amplitude + text visemes, or by system-TTS word ranges — never claimed
  as phoneme-perfect.
- **One brain:** every turn carries conversation history + user-controlled
  capped memory + tool results. Follow-ups work. The only non-model
  fallback is the clearly-labelled offline/local mode.
- **A real agent:** Understand → Plan → Select tools → Execute → Inspect
  → Recover (RETRY/SKIP/REPLAN/ABORT) → Verify → Report. Research is
  multi-query and source-grounded. A website request produces real files,
  validation, a working preview and ZIP export — or is reported
  incomplete. Sensitive actions need confirmation; unsupported phone
  actions are reported unsupported, never marked done.
- **Multiple views:** cinematic home, task console, research + sources,
  projects, preview, settings (providers, voice, memory, privacy,
  effects), provider health on the home screen.

## Providers and free limits (honest)

- Pollinations (keyless, default): public endpoint, rate-limited, NOT
  private. Do not send sensitive data. No unlimited-free claim.
- OpenRouter / Gemini / Groq / Mistral / Cloudflare / SambaNova: free
  tiers with documented limits, each requiring the user's own key
  (encrypted storage; keys never in source, logs or the APK).
- Key validation lists models before any chat call; failover tries at
  most 3 providers; rate-limited providers are not retried for 60 s.
- Algeria access from the build environment is NOT verified — confirm
  on the phone.

## What is NOT claimed

- Audible voice quality, microphone recognition, face rendering on a
  physical phone, and the full spoken restaurant flow are
  **phone-required** until the user confirms them. Emulator screenshots
  are best-effort (CI emulator boots without KVM and has timed out
  before). Nothing here is "verified" merely because its code exists.
- No npm/native-toolchain execution happens on-device. Larger projects
  needing those toolchains are a stated limit, not a hidden one.
- No backend service is shipped. JARVIS's hosted FastAPI/Postgres/Redis
  service was evaluated and not shipped (no funded backend authorised).

## Licences and attribution

See NOTICE.md: sherpa-onnx (Apache-2.0), Piper voice model (dataset
licence per its model card), JARVIS-OS-V.2 patterns (MIT, adapted in
Kotlin, not copied verbatim), Filament (Apache-2.0, evaluated only).
