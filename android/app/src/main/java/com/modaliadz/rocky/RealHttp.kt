package com.modaliadz.rocky

import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Real HTTP client: HttpURLConnection, 30 s timeouts, no heavy dependencies. */
class RealHttpClient : HttpClient {
    override fun get(url: String, headers: Map<String, String>): HttpResponse {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 30000; readTimeout = 30000
            setRequestProperty("User-Agent", "ROCKY-AI/4.0")
            for ((k, v) in headers) setRequestProperty(k, v)
        }
        return readResponse(conn)
    }

    override fun post(url: String, headers: Map<String, String>, body: String): HttpResponse {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 30000; readTimeout = 30000
            setRequestProperty("User-Agent", "ROCKY-AI/4.0")
            for ((k, v) in headers) setRequestProperty(k, v)
        }
        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        return readResponse(conn)
    }

    private fun readResponse(conn: HttpURLConnection): HttpResponse {
        val code = try { conn.responseCode } catch (e: Exception) { throw RuntimeException("Network error: ${e.message}") }
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val body = if (stream != null) {
            BufferedReader(InputStreamReader(stream)).use { it.readText() }
        } else ""
        conn.disconnect()
        return HttpResponse(code, body)
    }
}

/** Real web research: DuckDuckGo Instant Answer first, Wikipedia action API second. */
class RealResearchClient(private val http: HttpClient = RealHttpClient()) : ResearchClient {
    override fun search(query: String): ResearchResult? {
        try {
            val q = URLEncoder.encode(query, "UTF-8")
            val ddg = http.get("https://api.duckduckgo.com/?q=$q&format=json&no_html=1&skip_disambig=1")
            if (ddg.code == 200) {
                val abs = JsonMini.stringValue(ddg.body, "Abstract")
                val heading = JsonMini.stringValue(ddg.body, "Heading")
                if (!abs.isNullOrBlank()) return ResearchResult(abs.take(600), "DuckDuckGo — ${heading ?: query}")
            }
        } catch (_: Exception) { }
        try {
            val q = URLEncoder.encode(query, "UTF-8")
            val wiki = http.get(
                "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&format=json&titles=$q",
                mapOf("User-Agent" to "ROCKY-AI/4.0")
            )
            if (wiki.code == 200) {
                val ext = JsonMini.stringValue(wiki.body, "extract")
                if (!ext.isNullOrBlank() && !ext.contains("may refer to")) {
                    return ResearchResult(ext.take(600), "Wikipedia — $query")
                }
            }
        } catch (_: Exception) { }
        return null
    }
}
