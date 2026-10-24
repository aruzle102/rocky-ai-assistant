package com.modaliadz.rocky

/** App-wide character / assistant states. INTRO is a real state, not a splash image. */
enum class RockyState { INTRO, IDLE, LISTENING, THINKING, SPEAKING, EXECUTING, ERROR }

enum class AiMode { SMART_AUTO, FAST, DEEP, OFFLINE }

enum class ProviderStatus { DISCOVERED, DOCUMENTED, TESTED, INTEGRATED }

data class ChatMessage(val role: String, val text: String, val provider: String = "", val at: Long = System.currentTimeMillis())
