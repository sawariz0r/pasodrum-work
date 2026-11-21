use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Emitter, Listener, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

static LOADED: AtomicBool = AtomicBool::new(false);

fn base() -> Url {
    let raw = std::env::var("PASODRUM_URL").unwrap_or_else(|_| "http://localhost:4173".into());
    Url::parse(&raw).expect("PASODRUM_URL")
}

/// Spike evidence log: ~/Library/Logs/Pasodrum Tauri/shell.log (or PASODRUM_LOG).
fn log(msg: impl AsRef<str>) {
    let path = std::env::var("PASODRUM_LOG").unwrap_or_else(|_| {
        let dir = format!("{}/Library/Logs/Pasodrum Tauri", std::env::var("HOME").unwrap_or_default());
        let _ = std::fs::create_dir_all(&dir);
        format!("{dir}/shell.log")
    });
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
        let _ = writeln!(f, "{}.{:03} {}", t.as_secs(), t.subsec_millis(), msg.as_ref());
    }
}

fn route_of(link: &Url) -> String {
    let mut r = link.path().to_string();
    if r.is_empty() {
        r.push('/');
    }
    if let Some(q) = link.query() {
        r.push('?');
        r.push_str(q);
    }
    if let Some(h) = link.fragment() {
        r.push('#');
        r.push_str(h);
    }
    r
}

fn focus(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn open_route(app: &AppHandle, route: String) {
    log(format!("open-route {route} loaded={}", LOADED.load(Ordering::SeqCst)));
    focus(app);
    if LOADED.load(Ordering::SeqCst) {
        let _ = app.emit("open-route", route);
    } else if let (Some(w), Ok(u)) = (app.get_webview_window("main"), base().join(&route)) {
        let _ = w.navigate(u);
    }
}

fn is_app_url(u: &Url) -> bool {
    !matches!(u.scheme(), "http" | "https") || u.origin() == base().origin()
}

#[cfg(target_os = "macos")]
fn notify(app: AppHandle, title: String, body: String, route: String) {
    // tauri-plugin-notification has no click callback on desktop; mac-notification-sys can block until clicked.
    std::thread::spawn(move || {
        let _ = mac_notification_sys::set_application(&app.config().identifier);
        let res = mac_notification_sys::Notification::new()
            .title(&title)
            .message(&body)
            .wait_for_click(true)
            .send();
        log(format!("notify result {res:?}"));
        if let Ok(mac_notification_sys::NotificationResponse::Click) = res {
            let a = app.clone();
            let _ = app.run_on_main_thread(move || open_route(&a, route));
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn notify(app: AppHandle, title: String, body: String, _route: String) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

pub fn run() {
    log(format!("start v{} base={}", env!("CARGO_PKG_VERSION"), base()));
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            log(format!("second instance {argv:?}"));
            focus(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            let cold = app.deep_link().get_current().ok().flatten().and_then(|v| v.first().cloned());
            log(format!("cold deep link {cold:?}"));
            let start = cold.as_ref().map(route_of).and_then(|r| base().join(&r).ok()).unwrap_or_else(base);

            let nav = handle.clone();
            let popup = handle.clone();
            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(start));
            // Spike: env-gated early script (console capture) for unattended probing.
            if let Some(js) = std::env::var("PASODRUM_PROBE_INIT").ok().and_then(|p| std::fs::read_to_string(p).ok()) {
                builder = builder.initialization_script(js);
            }
            builder
                .title("Pasodrum Tauri")
                .inner_size(1200.0, 800.0)
                .min_inner_size(720.0, 480.0)
                .initialization_script(include_str!("../bridge.js"))
                .on_navigation(move |u| {
                    if is_app_url(u) {
                        return true;
                    }
                    log(format!("navigation external {u}"));
                    let _ = nav.opener().open_url(u.as_str(), None::<&str>);
                    false
                })
                .on_new_window(move |u, _features| {
                    log(format!("new window {u}"));
                    if matches!(u.scheme(), "http" | "https") {
                        let _ = popup.opener().open_url(u.as_str(), None::<&str>);
                    }
                    NewWindowResponse::Deny
                })
                .on_page_load(move |w, p| {
                    if let PageLoadEvent::Finished = p.event() {
                        LOADED.store(true, Ordering::SeqCst);
                        log(format!("page loaded {}", p.url()));
                        if let Ok(path) = std::env::var("PASODRUM_PROBE") {
                            if let Ok(js) = std::fs::read_to_string(&path) {
                                let _ = w.eval(&js);
                            }
                        }
                    } else {
                        LOADED.store(false, Ordering::SeqCst);
                    }
                })
                .build()?;

            let dl = handle.clone();
            app.deep_link().on_open_url(move |e| {
                for u in e.urls() {
                    log(format!("deep link {u}"));
                    open_route(&dl, route_of(&u));
                }
            });

            let n = handle.clone();
            app.listen("shell-notify", move |e| {
                log(format!("shell-notify {}", e.payload()));
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(e.payload()) {
                    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or_default().to_string();
                    notify(n.clone(), s("title"), s("body"), s("route"));
                }
            });
            app.listen("probe", |e| log(format!("probe {}", e.payload())));

            if std::env::var("PASODRUM_UPDATE").is_ok() {
                let up = handle.clone();
                tauri::async_runtime::spawn(async move { update(up).await });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn update(app: AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    tokio_sleep(5).await;
    log("update: check");
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => return log(format!("update: updater error {e}")),
    };
    match updater.check().await {
        Ok(Some(u)) => {
            log(format!("update: found {} -> {}", u.current_version, u.version));
            let mut got = 0usize;
            match u
                .download_and_install(|n, total| {
                    got += n;
                    if total.map_or(false, |t| got as u64 >= t) {
                        log(format!("update: downloaded {got} bytes"));
                    }
                }, || log("update: download finished, verifying/installing"))
                .await
            {
                Ok(()) => {
                    log("update: installed, restarting");
                    app.restart();
                }
                Err(e) => log(format!("update: install error {e}")),
            }
        }
        Ok(None) => log("update: none"),
        Err(e) => log(format!("update: check error {e}")),
    }
}

async fn tokio_sleep(secs: u64) {
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(secs));
        let _ = tx.send(());
    });
    let _ = tauri::async_runtime::spawn_blocking(move || rx.recv()).await;
}
