import SwiftUI
import WebKit

struct LogWebView: UIViewRepresentable {
    @ObservedObject var recorder: Recorder
    static let site = URL(string: "https://kniha-jizd-joe.josef-dolezal838830.chatgpt.site/index.html")!
    func makeCoordinator() -> Coordinator { Coordinator(recorder) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(context.coordinator, name: "nativeRide")
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = context.coordinator
        web.load(URLRequest(url: Self.site)); return web
    }
    func updateUIView(_ web: WKWebView, context: Context) { context.coordinator.transfer(web) }
    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let recorder: Recorder
        init(_ recorder: Recorder) { self.recorder = recorder }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { transfer(webView) }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.host == LogWebView.site.host,
                  let body = message.body as? [String: String], body["action"] == "saved", let id = body["id"] else { return }
            recorder.acknowledge(id)
        }
        func transfer(_ web: WKWebView) {
            guard web.url?.host == LogWebView.site.host,
                  let ride = recorder.ride, ride.endedAt != nil,
                  let data = try? JSONEncoder().encode(ride), let payload = String(data: data, encoding: .utf8) else { return }
            let script = """
            (() => {
              const nativeRide = \(payload);
              function transfer() {
                if (typeof storageReady === 'undefined' || !storageReady || storageBusy) {
                  if (!window.__nativeWait) window.__nativeWait = setTimeout(() => { window.__nativeWait = null; transfer(); }, 1000);
                  return;
                }
                if (log.trips.some(t => t.nativeRideId === nativeRide.id)) {
                  window.webkit.messageHandlers.nativeRide.postMessage({action:'saved',id:nativeRide.id}); return;
                }
                if (state.draft?.nativeRideId === nativeRide.id) return;
                if (state.draft || state.startedAt) return;
                state.draft = {...nativeRide, nativeRideId:nativeRide.id, odometerStart:loadOdometer(), odometerEnd:loadOdometer()+nativeRide.distanceKm};
                prepareFinish();
                $('finalDistance').textContent = nativeRide.distanceKm.toFixed(3);
                $('finalOdometer').textContent = formatOdometer(state.draft.odometerEnd);
                $('idlePanel').classList.add('hidden'); $('finishPanel').classList.remove('hidden');
                if (!window.__nativePersistWrapped) {
                  window.__nativePersistWrapped = true;
                  const original = persistLog;
                  persistLog = async function(odo, trips) {
                    const result = await original(odo, trips);
                    if (result) {
                      const trip = trips.find(t => t.nativeRideId);
                      if (trip) window.webkit.messageHandlers.nativeRide.postMessage({action:'saved',id:trip.nativeRideId});
                    }
                    return result;
                  };
                }
              }
              transfer();
            })();
            """
            web.evaluateJavaScript(script, completionHandler: nil)
        }
    }
}
