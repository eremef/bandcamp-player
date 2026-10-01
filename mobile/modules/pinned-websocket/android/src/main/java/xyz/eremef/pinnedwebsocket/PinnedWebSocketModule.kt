package xyz.eremef.pinnedwebsocket

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager
import java.util.concurrent.TimeUnit

class PinnedWebSocketModule : Module() {
    private var webSocket: WebSocket? = null
    private var client: OkHttpClient? = null

    override fun definition() = ModuleDefinition {
        Name("PinnedWebSocket")
        Events("onOpen", "onMessage", "onClose", "onError")

        AsyncFunction("connect") { url: String, caFingerprint: String? ->
            val previousSocket = webSocket
            webSocket = null
            previousSocket?.close(1000, "Replaced")
            client?.dispatcher?.cancelAll()
            client = null

            val builder = OkHttpClient.Builder()
                .retryOnConnectionFailure(false)
                .pingInterval(25, TimeUnit.SECONDS)

            if (url.startsWith("wss://", ignoreCase = true)) {
                val fingerprint = caFingerprint?.replace(":", "")?.replace(" ", "")?.lowercase()
                    ?: throw IllegalArgumentException("A pinned desktop certificate is required for safe connections")
                if (!fingerprint.matches(Regex("[0-9a-f]{64}"))) {
                    throw IllegalArgumentException("The desktop certificate fingerprint is invalid")
                }
                val trustManager = createPinnedTrustManager(fingerprint)
                val sslContext = SSLContext.getInstance("TLS")
                sslContext.init(null, arrayOf<TrustManager>(trustManager), SecureRandom())
                builder.sslSocketFactory(sslContext.socketFactory, trustManager)
            } else if (!url.startsWith("ws://", ignoreCase = true)) {
                throw IllegalArgumentException("Unsupported remote connection protocol")
            }

            client = builder.build()
            val request = Request.Builder().url(url).build()
            webSocket = client!!.newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    if (this@PinnedWebSocketModule.webSocket !== webSocket) return
                    sendEvent("onOpen", emptyMap<String, Any>())
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    if (this@PinnedWebSocketModule.webSocket !== webSocket) return
                    sendEvent("onMessage", mapOf("data" to text))
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(code, reason)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    if (this@PinnedWebSocketModule.webSocket !== webSocket) return
                    sendEvent("onClose", mapOf("code" to code, "reason" to reason))
                }

                override fun onFailure(webSocket: WebSocket, error: Throwable, response: Response?) {
                    if (this@PinnedWebSocketModule.webSocket !== webSocket) return
                    sendEvent("onError", mapOf("message" to (error.message ?: "Connection failed")))
                    sendEvent("onClose", mapOf("code" to 1006, "reason" to "Connection failed"))
                }
            })
            true
        }

        Function("send") { data: String ->
            webSocket?.send(data) ?: false
        }

        Function("close") {
            webSocket?.close(1000, "Client closed")
            webSocket = null
            client?.dispatcher?.cancelAll()
            client = null
        }
    }

    private fun createPinnedTrustManager(expectedFingerprint: String): X509TrustManager {
        return object : X509TrustManager {
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()

            override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) {
                throw CertificateException("Client certificates are not accepted")
            }

            override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
                if (chain.isEmpty()) throw CertificateException("The desktop sent no certificate")
                chain.forEach { it.checkValidity() }
                val pinnedIndex = chain.indexOfFirst { certificate ->
                    sha256(certificate.encoded) == expectedFingerprint
                }
                if (pinnedIndex < 0) throw CertificateException("The desktop certificate does not match the paired host")

                for (index in 0 until pinnedIndex) {
                    val child = chain[index]
                    val issuer = chain[index + 1]
                    if (child.issuerX500Principal != issuer.subjectX500Principal) {
                        throw CertificateException("The desktop certificate chain is invalid")
                    }
                    child.verify(issuer.publicKey)
                }

                val pinnedAuthority = chain[pinnedIndex]
                if (pinnedAuthority.basicConstraints < 0 || pinnedAuthority.keyUsage?.getOrNull(5) != true) {
                    throw CertificateException("The pinned desktop certificate is not a certificate authority")
                }
                val leaf = chain.first()
                if (leaf.basicConstraints >= 0 || leaf.extendedKeyUsage?.contains("1.3.6.1.5.5.7.3.1") != true) {
                    throw CertificateException("The desktop certificate is not valid for a remote server")
                }
                if (pinnedAuthority.subjectX500Principal == pinnedAuthority.issuerX500Principal) {
                    pinnedAuthority.verify(pinnedAuthority.publicKey)
                }
            }
        }
    }

    private fun sha256(data: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(data)
        .joinToString("") { byte -> "%02x".format(byte) }
}
