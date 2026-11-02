import UIKit
import WebKit

@main
@MainActor
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private var controller: PeriodController?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        do {
            let root = try FileManager.default.url(for: .applicationSupportDirectory,
                in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("PeriodRecords")
            let controller = try PeriodController(recordsAt: root.appendingPathComponent("records.json"))
            self.controller = controller
            window.rootViewController = controller
        } catch {
            let view = UIViewController()
            view.view.backgroundColor = .systemBackground
            let label = UILabel()
            label.text = "记录暂时无法读取。请保留 App，稍后重试。\n原有记录没有被清空。"
            label.numberOfLines = 0
            label.textAlignment = .center
            label.translatesAutoresizingMaskIntoConstraints = false
            view.view.addSubview(label)
            NSLayoutConstraint.activate([
                label.leadingAnchor.constraint(equalTo: view.view.leadingAnchor, constant: 24),
                label.trailingAnchor.constraint(equalTo: view.view.trailingAnchor, constant: -24),
                label.centerYAnchor.constraint(equalTo: view.view.centerYAnchor)
            ])
            window.rootViewController = view
        }
        self.window = window
        window.makeKeyAndVisible()
        return true
    }

}

@MainActor
final class PeriodController: UIViewController, WKUIDelegate, WKNavigationDelegate {
    let store: RecordStore
    private var webView: WKWebView!
    private var www: URL!

    init(recordsAt url: URL) throws {
        store = try RecordStore(url: url)
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("Not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-period-smoke") && !ProcessInfo.processInfo.arguments.contains("-period-smoke-relaunch") {
            let seed = """
            (() => {const d=new Date();d.setDate(d.getDate()-60);const f=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');const start=f(d);d.setDate(d.getDate()+6);localStorage.setItem('period-tracker-v4',JSON.stringify([{id:'legacy-smoke',startDate:start,endDate:f(d)}]));localStorage.setItem('period-algo-version','1.2');})();
            """
            config.userContentController.addUserScript(WKUserScript(source: seed, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        #endif
        if let url = Bundle.main.url(forResource: "bridge", withExtension: "js"),
           let source = try? String(contentsOf: url, encoding: .utf8) {
            config.userContentController.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .white
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        do {
            // Retain the legacy file URL so an existing Expo WebKit store can be
            // imported before the native storage adapter takes over.
            www = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask,
                appropriateFor: nil, create: true).appendingPathComponent("period-www", isDirectory: true)
            try prepareAssets()
            webView.loadFileURL(www.appendingPathComponent("index.html"), allowingReadAccessTo: www)
        } catch { showFailure("页面暂时无法加载，请重新打开 App。") }
    }

    private func prepareAssets() throws {
        let manager = FileManager.default
        guard let bundled = Bundle.main.url(forResource: "www", withExtension: nil) else { throw StoreFailure.invalidData }
        try manager.createDirectory(at: www, withIntermediateDirectories: true)
        for file in try manager.contentsOfDirectory(at: bundled, includingPropertiesForKeys: nil) {
            let target = www.appendingPathComponent(file.lastPathComponent)
            if manager.fileExists(atPath: target.path) { try manager.removeItem(at: target) }
            try manager.copyItem(at: file, to: target)
        }
        // Web assets can always be reconstructed from the signed app bundle.
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try www.setResourceValues(values)
    }

    private func evaluate(_ script: String) {
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }

    private func showFailure(_ text: String) {
        let alert = UIAlertController(title: "请稍后重试", message: text, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default))
        present(alert, animated: true)
    }

    #if DEBUG
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard ProcessInfo.processInfo.arguments.contains("-period-smoke") else { return }
        let relaunch = ProcessInfo.processInfo.arguments.contains("-period-smoke-relaunch")
        let script = """
        const wait=ms=>new Promise(r=>setTimeout(r,ms));
        for(let i=0;i<100&&!document.querySelector('.period-days');i++)await wait(100);
        if(!document.querySelector('.period-days'))throw new Error('Calendar did not render: '+document.body.innerText.slice(0,200));
        const read=()=>JSON.parse(localStorage.getItem('period-tracker-v4'));
        if(!read().some(x=>x.id==='legacy-smoke'))throw new Error('Legacy history missing');
        if(localStorage.getItem('period-algo-version')!=='1.2')throw new Error('Algorithm choice lost');
        if(!relaunch){
          const d=new Date(),today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
          document.querySelector('[data-date="'+today+'"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
          await wait(300);
        }
        if(read().length!==2)throw new Error('Record count was '+read().length);
        document.querySelector('[aria-label="备份与恢复"]').click();await wait(100);
        const copy=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('复制到剪贴板'));
        if(!copy)throw new Error('Clipboard button missing');copy.click();await wait(100);
        if(!document.querySelector('#period-icloud-status'))throw new Error('Backup explanation missing');
        return {ok:true,relaunch,records:read().length,clipboardUI:document.body.innerText.includes('已复制到剪贴板')};
        """
        webView.callAsyncJavaScript(script, arguments: ["relaunch": relaunch], in: nil, contentWorld: .page) { [weak self] result in
            guard let self else { return }
            var report: [String: Any]
            switch result {
            case .success(let value): report = value as? [String: Any] ?? ["ok": false]
            case .failure(let error): report = ["ok": false, "error": error.localizedDescription]
            }
            report["nativeClipboard"] = UIPasteboard.general.string?.contains("legacy-smoke") == true
            if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted]) {
                try? data.write(to: self.www.deletingLastPathComponent().appendingPathComponent("simulator-smoke.json"), options: [.atomic])
            }
        }
    }
    #endif

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        // Only bundled pages receive native storage and clipboard access.
        let allowed = url.isFileURL && url.standardizedFileURL.path.hasPrefix(www.path + "/")
        decisionHandler(allowed ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        guard prompt == "__PERIOD_NATIVE_V1__", frame.isMainFrame,
              frame.request.url?.isFileURL == true,
              frame.request.url?.standardizedFileURL.path.hasPrefix(www.path + "/") == true,
              let data = defaultText?.data(using: .utf8), data.count <= 8_000_000,
              let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { completionHandler(nil); return }
        do {
            let action = message["action"] as? String
            if action == "bootstrap" {
                // The migration flag lives in the same atomic document as the
                // records, so a backup cannot restore one without the other.
                try store.importLegacy(message["legacy"] as? [String: String] ?? [:])
            } else if action == "write" {
                guard let key = message["key"] as? String else { throw StoreFailure.invalidData }
                try store.write(key: key, value: message["value"] as? String)
            } else if action == "copy" {
                guard let text = message["text"] as? String else { throw StoreFailure.invalidData }
                UIPasteboard.general.string = text
            } else if action != "snapshot" { throw StoreFailure.invalidData }
            let response: [String: Any] = ["ok": true, "values": store.values]
            let encoded = try JSONSerialization.data(withJSONObject: response)
            completionHandler(String(data: encoded, encoding: .utf8))
        } catch {
            completionHandler("{\"ok\":false,\"error\":\"保存失败，原记录仍保留，请重试\"}")
            if message["action"] as? String == "bootstrap" {
                // Don't silently run the old browser-only store when migration
                // failed; the user must know native persistence is unavailable.
                webView.isHidden = true
                showFailure("记录暂时无法迁移。原记录仍保留，请保留 App 并稍后重试。")
            }
        }
    }
}
