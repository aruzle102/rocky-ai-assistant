package com.modaliadz.rocky

/**
 * Modular multi-provider engine. Pure Kotlin, no Android framework imports,
 * so it is unit-testable on the JVM. Network is injected via [HttpClient].
 *
 * Status vocabulary (shown in UI, never inflated):
 * DISCOVERED = listed from docs, DOCUMENTED = free tier + signup steps known,
 * TESTED = a real request succeeded, INTEGRATED = wired and tested in-app.
 * A provider is never reported WORKING without a successful real test.
 */
data class HttpResponse(val code: Int, val body: String)

interface HttpClient {
    fun get(url: String, headers: Map<String, String> = emptyMap()): HttpResponse
    fun post(url: String, headers: Map<String, String>, body: String): HttpResponse
}

data class Provider(
    val id: String,
    val name: String,
    val baseUrl: String,
    val defaultModel: String,
    val requiresKey: Boolean,
    val accountIdNeeded: Boolean = false,
    val reasoningCapable: Boolean = false,
    val status: ProviderStatus,
    val setupNote: String,
    val freeNote: String,
    val modelsUrl: String? = null,
    val keyless: Boolean = false
)

data class ProviderHealth(
    var successes: Int = 0,
    var failures: Int = 0,
    var consecutiveFailures: Int = 0,
    var lastLatencyMs: Long? = null,
    var lastError: String? = null,
    var enabled: Boolean = true,
    var autoDisabled: Boolean = false
)

data class ChatAttempt(val providerId: String, val ok: Boolean, val latencyMs: Long, val error: String? = null)
data class ChatResult(
    val providerId: String, val model: String, val text: String,
    val latencyMs: Long, val attempts: List<ChatAttempt>
)
data class CompareResult(val first: ChatResult?, val second: ChatResult?, val synthesis: String)

object ProviderRegistry {
    val builtIn: List<Provider> = listOf(
        Provider(
            id = "pollinations", name = "Pollinations (keyless)", baseUrl = "https://text.pollinations.ai",
            defaultModel = "openai-fast", requiresKey = false, status = ProviderStatus.INTEGRATED, keyless = true,
            setupNote = "No account, no key. Enable it in Settings.",
            freeNote = "Keyless public endpoint, rate-limited, NOT private. Do not send sensitive data.",
            modelsUrl = "https://text.pollinations.ai/models"
        ),
        Provider(
            id = "openrouter", name = "OpenRouter (free models)", baseUrl = "https://openrouter.ai/api/v1",
            defaultModel = "google/gemma-4-31b-it:free", requiresKey = true, reasoningCapable = true,
            status = ProviderStatus.DOCUMENTED,
            setupNote = "Create a free account at openrouter.ai, copy a key, paste it in Settings, tap Test. Free :free models are limited (documented 50 requests/day for free accounts).",
            freeNote = "Free :free models only; other models are paid. Limits change — check openrouter.ai/docs.",
            modelsUrl = "https://openrouter.ai/api/v1/models"
        ),
        Provider(
            id = "gemini", name = "Google Gemini (AI Studio)", baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai",
            defaultModel = "gemini-2.5-flash", requiresKey = true, reasoningCapable = true,
            status = ProviderStatus.DOCUMENTED,
            setupNote = "Create a free key in Google AI Studio (aistudio.google.com), paste it in Settings, tap Test. Uses the OpenAI-compatible endpoint.",
            freeNote = "Free tier with per-model rate limits (RPM/RPD) shown in AI Studio. No card for the free tier."
        ),
        Provider(
            id = "groq", name = "Groq (fast)", baseUrl = "https://api.groq.com/openai/v1",
            defaultModel = "openai/gpt-oss-120b", requiresKey = true, reasoningCapable = true,
            status = ProviderStatus.DOCUMENTED,
            setupNote = "Create a free account at groq.com, copy a key, paste it in Settings, tap Test.",
            freeNote = "Free developer tier, model-specific RPM/RPD/TPD limits. No card for the free tier."
        ),
        Provider(
            id = "mistral", name = "Mistral", baseUrl = "https://api.mistral.ai/v1",
            defaultModel = "mistral-small-latest", requiresKey = true,
            status = ProviderStatus.DOCUMENTED,
            setupNote = "Create an account at console.mistral.ai, copy a key, paste it in Settings, tap Test.",
            freeNote = "Free mode / experiment tier with per-project caps shown in the console."
        ),
        Provider(
            id = "cloudflare", name = "Cloudflare Workers AI", baseUrl = "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1",
            defaultModel = "@cf/meta/llama-3.3-70b-instruct-fp8-fast", requiresKey = true, accountIdNeeded = true,
            status = ProviderStatus.DOCUMENTED,
            setupNote = "Create a Cloudflare account, copy your API token AND Account ID, replace ACCOUNT_ID in the base URL, paste both in Settings, tap Test.",
            freeNote = "10,000 Neurons/day free allowance (documented). Neurons are compute units, not tokens."
        ),
        Provider(
            id = "sambanova", name = "SambaNova", baseUrl = "https://api.sambanova.ai/v1",
            defaultModel = "Meta-Llama-3.3-70B-Instruct", requiresKey = true,
            status = ProviderStatus.DOCUMENTED,
            setupNote = "Create a free account at cloud.sambanova.ai, copy a key, paste it in Settings, tap Test.",
            freeNote = "Free tier with documented RPM/RPD/TPD limits for listed models."
        )
    )

    fun byId(id: String): Provider? = builtIn.find { it.id == id }
}

/** Minimal JSON helpers that do not need org.json (which is stubbed in unit tests). */
object JsonMini {
    /** Extract a JSON string value for [key] starting the search at [from]. */
    fun stringValue(json: String, key: String, from: Int = 0): String? {
        val needle = "\"$key\""
        val ki = json.indexOf(needle, from)
        if (ki < 0) return null
        val colon = json.indexOf(':', ki + needle.length)
        if (colon < 0) return null
        var i = colon + 1
        while (i < json.length && json[i].isWhitespace()) i++
        if (i >= json.length || json[i] != '"') return null
        val sb = StringBuilder(); i++
        while (i < json.length) {
            val c = json[i]
            if (c == '\\' && i + 1 < json.length) {
                when (json[i + 1]) {
                    'n' -> sb.append('\n'); 't' -> sb.append('\t'); 'r' -> sb.append('\r')
                    '"' -> sb.append('"'); '\\' -> sb.append('\\'); '/' -> sb.append('/')
                    else -> sb.append(json[i + 1])
                }
                i += 2
            } else if (c == '"') return sb.toString()
            else { sb.append(c); i++ }
        }
        return null
    }

    fun allIds(json: String): List<String> {
        val out = mutableListOf<String>()
        var from = 0
        while (true) {
            val v = stringValue(json, "id", from) ?: break
            out.add(v)
            val idx = json.indexOf(v, from)
            from = if (idx < 0) break else idx + v.length
            if (out.size > 500) break
        }
        return out
    }

    fun escape(s: String): String = s.replace("\\", "\\\\").replace("\"", "\\\"")
        .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")
}

class ProviderEngine(
    private val http: HttpClient,
    val health: MutableMap<String, ProviderHealth> = mutableMapOf()
) {
    fun healthOf(id: String): ProviderHealth = health.getOrPut(id) { ProviderHealth() }

    private fun recordSuccess(id: String, latencyMs: Long) {
        val h = healthOf(id)
        h.successes++; h.consecutiveFailures = 0; h.lastLatencyMs = latencyMs; h.lastError = null; h.autoDisabled = false
    }

    private fun recordFailure(id: String, error: String) {
        val h = healthOf(id)
        h.failures++; h.consecutiveFailures++; h.lastError = error
        if (h.consecutiveFailures >= 3) { h.autoDisabled = true }
    }

    fun isUsable(p: Provider, apiKey: String): Boolean {
        val h = healthOf(p.id)
        if (!h.enabled || h.autoDisabled) return false
        if (p.requiresKey && apiKey.isBlank()) return false
        return true
    }

    /** Order candidates for a mode. Never includes unusable providers. */
    fun orderCandidates(providers: List<Provider>, keys: Map<String, String>, mode: AiMode): List<Provider> {
        val usable = providers.filter { isUsable(it, keys[it.id] ?: "") }
        return when (mode) {
            AiMode.FAST -> usable
            AiMode.DEEP -> usable.sortedByDescending { it.reasoningCapable }
            AiMode.SMART_AUTO -> usable.sortedWith(
                compareByDescending<Provider> { healthOf(it.id).successes > 0 }
                    .thenBy { healthOf(it.id).lastLatencyMs ?: Long.MAX_VALUE }
            )
            AiMode.OFFLINE -> emptyList()
        }
    }

    /** One attempt against one provider. Returns text or throws with a clear message. */
    fun attempt(p: Provider, apiKey: String, accountId: String, model: String, prompt: String, history: List<ChatMessage>): String {
        val base = if (p.accountIdNeeded) p.baseUrl.replace("ACCOUNT_ID", accountId.ifBlank { "ACCOUNT_ID" }) else p.baseUrl
        if (p.id == "pollinations") {
            val url = base.trimEnd('/') + "/" + prompt.take(1500)
                .replace(" ", "%20").replace("\n", " ")
            val r = http.get(url)
            if (r.code != 200) throw RuntimeException("Pollinations HTTP ${r.code}")
            if (r.body.isBlank()) throw RuntimeException("Pollinations returned an empty reply")
            return r.body.trim()
        }
        val messages = StringBuilder()
        messages.append("{\"role\":\"system\",\"content\":\"You are ROCKY, a calm, confident, direct masculine AI assistant. Answer concisely.\"}")
        for (m in history.takeLast(10)) {
            messages.append(",{\"role\":\"${if (m.role == "rocky") "assistant" else "user"}\",\"content\":\"${JsonMini.escape(m.text)}\"}")
        }
        messages.append(",{\"role\":\"user\",\"content\":\"${JsonMini.escape(prompt)}\"}")
        val body = "{\"model\":\"${JsonMini.escape(model)}\",\"messages\":[$messages]}"
        val headers = mutableMapOf("Content-Type" to "application/json")
        if (apiKey.isNotBlank()) headers["Authorization"] = "Bearer $apiKey"
        val r = http.post(base.trimEnd('/') + "/chat/completions", headers, body)
        if (r.code == 401 || r.code == 403) throw RuntimeException("HTTP $codeText(r.code): check the API key for ${p.name}")
        if (r.code == 429) throw RuntimeException("HTTP 429: ${p.name} rate limit reached — try again later or switch provider")
        if (r.code != 200) throw RuntimeException("${p.name} HTTP ${r.code}")
        // content lives inside choices[0].message.content
        val choicesIdx = r.body.indexOf("\"choices\"")
        val content = if (choicesIdx >= 0) JsonMini.stringValue(r.body, "content", choicesIdx) else null
        if (content.isNullOrBlank()) throw RuntimeException("${p.name} returned an empty reply")
        return content.trim()
    }

    private fun codeText(code: Int) = code.toString()

    /**
     * Chat with failover: at most 3 attempts, in candidate order.
     * Throws only after every candidate failed, with the last error attached.
     */
    fun chat(
        prompt: String, history: List<ChatMessage>, mode: AiMode,
        providers: List<Provider>, keys: Map<String, String>, accounts: Map<String, String>,
        models: Map<String, String>, preferredId: String?
    ): ChatResult {
        if (mode == AiMode.OFFLINE) throw IllegalStateException("offline")
        var candidates = orderCandidates(providers, keys, mode)
        if (preferredId != null) {
            val pref = candidates.find { it.id == preferredId }
            if (pref != null) candidates = listOf(pref) + candidates.filter { it.id != preferredId }
        }
        if (candidates.isEmpty()) throw RuntimeException("No provider is connected and enabled. Enable Pollinations (keyless) or add a free key in Settings, then tap Test.")
        val attempts = mutableListOf<ChatAttempt>()
        var lastError = "no attempt"
        for (p in candidates.take(3)) {
            val start = System.currentTimeMillis()
            try {
                val model = models[p.id]?.takeIf { it.isNotBlank() } ?: p.defaultModel
                val text = attempt(p, keys[p.id] ?: "", accounts[p.id] ?: "", model, prompt, history)
                val latency = System.currentTimeMillis() - start
                recordSuccess(p.id, latency)
                attempts.add(ChatAttempt(p.id, true, latency))
                return ChatResult(p.id, model, text, latency, attempts)
            } catch (e: Exception) {
                val latency = System.currentTimeMillis() - start
                lastError = e.message ?: "unknown error"
                recordFailure(p.id, lastError)
                attempts.add(ChatAttempt(p.id, false, latency, lastError))
            }
        }
        throw RuntimeException("All providers failed. Last error: $lastError")
    }

    /** Compare: one attempt per provider (max 2), answers shown separately, local synthesis. */
    fun compare(
        prompt: String, history: List<ChatMessage>,
        providers: List<Provider>, keys: Map<String, String>, accounts: Map<String, String>, models: Map<String, String>
    ): CompareResult {
        val usable = providers.filter { isUsable(it, keys[it.id] ?: "") }.take(2)
        val results = mutableListOf<ChatResult>()
        for (p in usable) {
            val start = System.currentTimeMillis()
            try {
                val model = models[p.id]?.takeIf { it.isNotBlank() } ?: p.defaultModel
                val text = attempt(p, keys[p.id] ?: "", accounts[p.id] ?: "", model, prompt, history)
                val latency = System.currentTimeMillis() - start
                recordSuccess(p.id, latency)
                results.add(ChatResult(p.id, model, text, latency, listOf(ChatAttempt(p.id, true, latency))))
            } catch (e: Exception) {
                val latency = System.currentTimeMillis() - start
                recordFailure(p.id, e.message ?: "error")
            }
        }
        val first = results.getOrNull(0); val second = results.getOrNull(1)
        val synthesis = when {
            first == null && second == null -> "Compare failed: no provider answered. Check Settings and try again."
            second == null -> "Only ${first!!.providerId} answered, so there is nothing to compare against."
            else -> "Synthesis from both answers: ${first.providerId} says “${first.text.take(160)}” and ${second.providerId} says “${second.text.take(160)}”. Use the first answer unless it conflicts with the second, in which case prefer the more specific one."
        }
        return CompareResult(first, second, synthesis)
    }

    /** Live model discovery. Returns ids (free-only for OpenRouter when [freeOnly] is true). */
    fun discoverModels(p: Provider, apiKey: String): List<String> {
        val url = p.modelsUrl ?: throw RuntimeException("${p.name} has no models endpoint")
        val headers = if (apiKey.isNotBlank()) mapOf("Authorization" to "Bearer $apiKey") else emptyMap()
        val r = http.get(url, headers)
        if (r.code != 200) throw RuntimeException("Models endpoint HTTP ${r.code} for ${p.name}")
        val ids = JsonMini.allIds(r.body)
        return if (p.id == "openrouter") ids.filter { it.endsWith(":free") }.ifEmpty { ids } else ids
    }
}
