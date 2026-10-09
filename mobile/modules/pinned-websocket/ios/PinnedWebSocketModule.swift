import CommonCrypto
import ExpoModulesCore
import Foundation
import Security

private final class PinnedWebSocketDelegate: NSObject, URLSessionDelegate, URLSessionWebSocketDelegate {
    let expectedFingerprint: String?
    var emit: ((String, [String: Any]) -> Void)?

    init(expectedFingerprint: String?) {
        self.expectedFingerprint = expectedFingerprint?.replacingOccurrences(of: ":", with: "").lowercased()
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust,
              let expectedFingerprint,
              SecTrustGetCertificateCount(trust) > 0 else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        guard let certificates = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
              let pinnedAuthority = certificates.last,
              fingerprint(of: pinnedAuthority) == expectedFingerprint,
              SecTrustSetAnchorCertificates(trust, [pinnedAuthority] as CFArray) == errSecSuccess,
              SecTrustSetAnchorCertificatesOnly(trust, true) == errSecSuccess else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        var trustError: CFError?
        if SecTrustEvaluateWithError(trust, &trustError) {
            completionHandler(.useCredential, URLCredential(trust: trust))
        } else {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol selectedProtocol: String?) {
        emit?("onOpen", [:])
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        let reasonText = reason.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        emit?("onClose", ["code": closeCode.rawValue, "reason": reasonText])
    }

    private func fingerprint(of certificate: SecCertificate) -> String {
        let data = SecCertificateCopyData(certificate) as Data
        var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        _ = data.withUnsafeBytes { bytes in
            CC_SHA256(bytes.baseAddress, CC_LONG(data.count), &digest)
        }
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

public final class PinnedWebSocketModule: Module {
    private var socket: URLSessionWebSocketTask?
    private var session: URLSession?
    private var socketDelegate: PinnedWebSocketDelegate?

    public func definition() -> ModuleDefinition {
        Name("PinnedWebSocket")
        Events("onOpen", "onMessage", "onClose", "onError")

        AsyncFunction("connect") { (urlString: String, caFingerprint: String?) throws -> Bool in
            self.closeSocket()
            guard let url = URL(string: urlString),
                  ["ws", "wss"].contains(url.scheme?.lowercased() ?? "") else {
                throw NSError(domain: "PinnedWebSocket", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unsupported remote URL"])
            }
            if url.scheme?.lowercased() == "wss" && caFingerprint == nil {
                throw NSError(domain: "PinnedWebSocket", code: 2, userInfo: [NSLocalizedDescriptionKey: "A pinned desktop certificate is required for safe connections"])
            }

            let delegate = PinnedWebSocketDelegate(expectedFingerprint: url.scheme?.lowercased() == "wss" ? caFingerprint : nil)
            delegate.emit = { [weak self, weak delegate] event, payload in
                guard let self, let delegate, self.socketDelegate === delegate else { return }
                self.sendEvent(event, payload)
            }
            let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
            let task = session.webSocketTask(with: url)
            self.socketDelegate = delegate
            self.session = session
            self.socket = task
            task.resume()
            self.receiveNext(task)
            return true
        }

        Function("send") { (data: String) -> Bool in
            guard let socket = self.socket else { return false }
            socket.send(.string(data)) { [weak self] error in
                if let error {
                    self?.sendEvent("onError", ["message": error.localizedDescription])
                }
            }
            return true
        }

        Function("close") {
            self.closeSocket()
        }
    }

    private func receiveNext(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            guard let self, self.socket === task else { return }
            switch result {
            case .success(let message):
                if case .string(let text) = message {
                    self.sendEvent("onMessage", ["data": text])
                }
                self.receiveNext(task)
            case .failure(let error):
                self.sendEvent("onError", ["message": error.localizedDescription])
                self.sendEvent("onClose", ["code": 1006, "reason": "Connection failed"])
            }
        }
    }

    private func closeSocket() {
        socket?.cancel(with: .normalClosure, reason: nil)
        socket = nil
        session?.invalidateAndCancel()
        session = nil
        socketDelegate = nil
    }
}
