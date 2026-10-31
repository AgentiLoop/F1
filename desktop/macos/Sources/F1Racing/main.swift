// Web-thin macOS app: a WKWebView window on the hosted game (Info.plist F1WebURL). No game files are bundled.
import AppKit
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var web: WKWebView!

    // Develop > Show Web Inspector (⌥⌘I): WebKit's inspector for this window (SPI _inspector.show).
    @objc func showWebInspector(_ sender: Any?) {
        guard let web, web.responds(to: NSSelectorFromString("_inspector")),
              let inspector = web.value(forKey: "_inspector") as? NSObject,
              inspector.responds(to: NSSelectorFromString("show")) else { return }
        inspector.perform(NSSelectorFromString("show"))
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.isElementFullscreenEnabled = true   // the game's Full screen button / gamepad X
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900), configuration: config)
        self.web = web
        if #available(macOS 13.3, *) { web.isInspectable = true }
        window = NSWindow(contentRect: web.frame, styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "AgentiLoop Racing F1"
        window.backgroundColor = .black
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.contentView = web
        window.setFrameAutosaveName("F1Racing")
        if !window.setFrameUsingName("F1Racing") { window.center() }
        window.makeKeyAndOrderFront(nil)
        let start = (Bundle.main.object(forInfoDictionaryKey: "F1WebURL") as? String) ?? "https://f1.gokart.games/"
        web.load(URLRequest(url: URL(string: start)!))
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let menu = NSMenu(), appItem = NSMenuItem()
menu.addItem(appItem)
appItem.submenu = NSMenu()
appItem.submenu!.addItem(withTitle: "Quit AgentiLoop Racing F1", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
let viewItem = NSMenuItem()
menu.addItem(viewItem)
viewItem.submenu = NSMenu(title: "View")
let fsItem = viewItem.submenu!.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
fsItem.keyEquivalentModifierMask = [.command, .control]
let delegate = AppDelegate()
let devItem = NSMenuItem()
menu.addItem(devItem)
devItem.submenu = NSMenu(title: "Develop")
let inspectItem = devItem.submenu!.addItem(withTitle: "Show Web Inspector",
                                           action: #selector(AppDelegate.showWebInspector(_:)), keyEquivalent: "i")
inspectItem.keyEquivalentModifierMask = [.command, .option]
inspectItem.target = delegate
app.mainMenu = menu
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
