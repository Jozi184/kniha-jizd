import SwiftUI
import WebKit
import UIKit

struct LogWebView: UIViewRepresentable {
    @ObservedObject var recorder: Recorder
    static let site = URL(string: "https://kniha-jizd-joe.josef-dolezal838830.chatgpt.site/index.html")!
    func makeCoordinator() -> Coordinator { Coordinator(recorder) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(context.coordinator, name: "nativeRide")
        if let path = Bundle.main.url(forResource: "NativeBridge", withExtension: "js"),
           let bridge = try? String(contentsOf: path, encoding: .utf8) {
            configuration.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 23/255, green: 25/255, blue: 29/255, alpha: 1)
        web.scrollView.backgroundColor = web.backgroundColor
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        context.coordinator.web = web
        web.load(URLRequest(url: Self.site))
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) { context.coordinator.publish() }
    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "nativeRide")
    }
    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        let recorder: Recorder
        weak var web: WKWebView?
        init(_ recorder: Recorder) { self.recorder = recorder }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { publish() }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "https",
                  message.frameInfo.securityOrigin.host == LogWebView.site.host,
                  let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
            switch action {
            case "start":
                if let value = body["odometerStart"] as? Double, value.isFinite, value >= 0 { recorder.start(odometer: value) }
            case "stop": recorder.stop()
            case "retry": recorder.retry()
            case "test": recorder.testGps()
            case "saved": if let id = body["id"] as? String { recorder.acknowledge(id) }
            case "discard": if let id = body["id"] as? String, recorder.ride?.id == id { recorder.discard() }
            case "export": if let csv = body["csv"] as? String, csv.utf8.count < 5_000_000 { export(csv) }
            case "snapshot": break
            default: return
            }
            publish()
        }
        func publish() {
            guard let web, web.url?.scheme == "https", web.url?.host == LogWebView.site.host else { return }
            struct Snapshot: Encodable { var ride: Ride?; var message: String; var speedKmh: Double }
            guard let data = try? JSONEncoder().encode(Snapshot(ride: recorder.ride, message: recorder.message, speedKmh: recorder.speedKmh)),
                  let json = String(data: data, encoding: .utf8) else { return }
            web.evaluateJavaScript("window.__receiveNativeRide && window.__receiveNativeRide(\(json));", completionHandler: nil)
        }
        private func presenter() -> UIViewController? {
            guard let scene = web?.window?.windowScene else { return nil }
            var controller = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
            while let next = controller?.presentedViewController { controller = next }
            return controller
        }
        private func export(_ csv: String) {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("kniha-jizd.csv")
            do { try csv.write(to: url, atomically: true, encoding: .utf8) }
            catch { showAlert("Export se nepodařilo uložit."); return }
            let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            share.popoverPresentationController?.sourceView = web
            presenter()?.present(share, animated: true)
        }
        private func showAlert(_ message: String, completion: (() -> Void)? = nil) {
            let alert = UIAlertController(title: "Kniha jízd", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completion?() })
            guard let controller = presenter() else { completion?(); return }
            controller.present(alert, animated: true)
        }
        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            showAlert(message, completion: completionHandler)
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
                if url.host == LogWebView.site.host { webView.load(navigationAction.request) }
                else { UIApplication.shared.open(url) }
            }
            return nil
        }
    }
}
