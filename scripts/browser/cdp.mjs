/**
 * Minimal Chrome DevTools Protocol driver.
 *
 * The project has no puppeteer/playwright and installing one is out of
 * scope, but Edge exposes CDP directly and `ws` is already present as a
 * vite dependency. Driving it over a websocket is enough to click real
 * buttons, resize the viewport, and read the real DOM — which is what a
 * UI review actually needs.
 *
 * Usage: node scripts/browser/cdp.mjs <script.mjs>  — or import connect().
 */
import { WebSocket } from "ws";

export async function connect() {
  const list = await (await fetch("http://127.0.0.1:9222/json/list")).json();
  let target = list.find((t) => t.type === "page");
  if (!target) {
    target = await (await fetch("http://127.0.0.1:9222/json/new?about:blank")).json();
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl, {
    maxPayload: 64 * 1024 * 1024,
  });
  await new Promise((res, rej) => {
    ws.once("open", res);
    ws.once("error", rej);
  });

  let id = 0;
  const pending = new Map();
  const consoleLog = [];
  const networkLog = [];

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    if (msg.method === "Runtime.consoleAPICalled") {
      consoleLog.push({
        type: msg.params.type,
        text: (msg.params.args ?? [])
          .map((a) => a.value ?? a.description ?? "")
          .join(" "),
      });
    }
    if (msg.method === "Runtime.exceptionThrown") {
      consoleLog.push({
        type: "exception",
        text:
          msg.params.exceptionDetails?.exception?.description ??
          msg.params.exceptionDetails?.text ??
          "exception",
      });
    }
    if (msg.method === "Network.responseReceived") {
      networkLog.push({
        url: msg.params.response.url,
        status: msg.params.response.status,
      });
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(
        r.exceptionDetails.text +
          " :: " +
          (r.exceptionDetails.exception?.description ?? "")
      );
    }
    return r.result.value;
  };

  const goto = async (url) => {
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const ready = await evaluate("document.readyState").catch(() => null);
      if (ready === "complete" || ready === "interactive") break;
    }
  };

  const waitFor = async (expr, timeoutMs = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await evaluate(`!!(${expr})`).catch(() => false)) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  };

  const click = async (selector) => {
    const ok = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error("click target not found: " + selector);
    await new Promise((r) => setTimeout(r, 350));
    return true;
  };

  const text = () => evaluate("document.body.innerText");
  const html = () => evaluate("document.documentElement.outerHTML");

  const setViewport = (width, height) =>
    send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });

  return {
    send,
    evaluate,
    goto,
    waitFor,
    click,
    text,
    html,
    setViewport,
    consoleLog,
    networkLog,
    close: () => ws.close(),
  };
}
