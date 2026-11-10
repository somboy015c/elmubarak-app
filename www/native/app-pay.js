/* In-app payments for the Android app.
   Opens Flutterwave's own payment window inside the app (Flutterwave Inline), then
   shows a full-screen status page that confirms the payment with our server and
   shows the result. js/dashboard.js hands payments here when window.AppPay exists. */
(function () {
  const FLW_SCRIPT = "https://checkout.flutterwave.com/v3.js";
  const POLL_EVERY_MS = 3000;
  const POLL_FOR_MS = 60000;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const naira = (n) => "₦" + Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const ICONS = {
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    success: '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" stroke-width="3"/><path class="ap-tick" d="M15 27l7 7 15-16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    failed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>'
  };

  let screen = null;

  function mount() {
    screen = document.createElement("div");
    screen.className = "ap-screen";
    screen.setAttribute("role", "dialog");
    screen.setAttribute("aria-live", "polite");
    document.body.appendChild(screen);
    requestAnimationFrame(() => screen.classList.add("open"));
    document.documentElement.classList.add("ap-open");
  }
  function unmount() {
    if (!screen) return;
    const el = screen;
    screen = null;
    el.classList.remove("open");
    document.documentElement.classList.remove("ap-open");
    setTimeout(() => el.remove(), 220);
  }

  // Header + body, with an optional thin progress bar instead of a spinner.
  function render({ busy, icon, tone, title, amount, message, extra = "", actions = "" }, ctx) {
    screen.innerHTML = `
      <header class="ap-head">
        <span class="ap-head-title">${esc(ctx.title)}</span>
        <span class="ap-secure">${ICONS.lock} Secured by Flutterwave</span>
      </header>
      ${busy ? '<div class="ap-progress"><i></i></div>' : '<div class="ap-progress-space"></div>'}
      <div class="ap-body">
        <div class="ap-icon ap-${tone || "neutral"}">${icon || ""}</div>
        <h2 class="ap-title">${esc(title)}</h2>
        ${amount !== undefined ? `<div class="ap-amount">${naira(amount)}</div>` : ""}
        ${message ? `<p class="ap-msg">${esc(message)}</p>` : ""}
        ${extra}
      </div>
      ${actions ? `<div class="ap-actions">${actions}</div>` : ""}`;
  }

  function rowsHtml(rows) {
    const list = rows.filter((r) => r && r[1] !== undefined && r[1] !== null && r[1] !== "");
    return list.length ? `<div class="ap-rows">${list.map(([k, v]) => `<div class="ap-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}</div>` : "";
  }

  function tokenHtml(order) {
    let out = "";
    if (order?.token) out += `<div class="ap-token"><small>Token / PIN</small><strong>${esc(order.token)}</strong><button type="button" class="ap-copy" data-copy="${esc(order.token)}">Copy</button></div>`;
    if (Array.isArray(order?.cards)) {
      out += order.cards.map((c) => {
        const value = Object.values(c).join(" / ");
        return `<div class="ap-token"><small>${esc(Object.keys(c).join(" / "))}</small><strong>${esc(value)}</strong><button type="button" class="ap-copy" data-copy="${esc(value)}">Copy</button></div>`;
      }).join("");
    }
    return out;
  }

  function loadFlutterwave() {
    if (window.FlutterwaveCheckout) return Promise.resolve(true);
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = FLW_SCRIPT;
      s.onload = () => resolve(!!window.FlutterwaveCheckout);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
      setTimeout(() => resolve(!!window.FlutterwaveCheckout), 15000);
    });
  }

  // Ask our server. Returns { state: success|pending|failed, ...response }.
  async function verify(reference) {
    try {
      return await Api.post("/wallet/fund/verify", { reference });
    } catch (err) {
      if (err.data?.state === "failed") return { state: "failed", error: err.message };
      return { state: "pending", error: err.message, offline: true };
    }
  }

  // Opens Flutterwave inside the app. Resolves "paid" | "closed" | "unavailable".
  async function openCheckout(data, ctx) {
    if (!data.inline?.public_key) return "unavailable";
    render({ busy: true, icon: ICONS.lock, tone: "neutral", title: "Opening secure payment", amount: ctx.amount, message: "Card, bank transfer or USSD" }, ctx);
    if (!(await loadFlutterwave())) return "unavailable";
    return new Promise((resolve) => {
      let paid = false;
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const modal = window.FlutterwaveCheckout({
        ...data.inline,
        callback: (resp) => {
          paid = !resp || resp.status !== "cancelled";
          try { modal?.close?.(); } catch (e) {}
          setTimeout(() => finish(paid ? "paid" : "closed"), 300);
        },
        onclose: () => finish(paid ? "paid" : "closed")
      });
    });
  }

  // Polls our server until the payment is final or we stop waiting.
  async function confirm(reference, ctx, patient) {
    render({ busy: true, icon: ICONS.pending, tone: "neutral", title: "Confirming your payment", amount: ctx.amount, message: "This usually takes a few seconds. Please don't close the app." }, ctx);
    const until = Date.now() + (patient ? POLL_FOR_MS : 0);
    let result = await verify(reference);
    while (result.state === "pending" && Date.now() < until) {
      await wait(POLL_EVERY_MS);
      result = await verify(reference);
    }
    return result;
  }

  function showResult(result, ctx, reference, { closedEarly } = {}) {
    return new Promise((resolve) => {
      const order = result.order;
      const orderState = order ? order.state : null;
      let tone, title;
      if (result.state === "success" && !order) { tone = "success"; title = "Wallet funded"; }
      else if (result.state === "success") {
        tone = orderState === "success" ? "success" : orderState === "pending" ? "pending" : "failed";
        title = { success: "Payment successful", pending: "Order processing", failed: "Order not completed" }[tone];
      } else if (result.state === "pending") { tone = "pending"; title = closedEarly ? "Payment not completed" : "Payment processing"; }
      else { tone = "failed"; title = "Payment failed"; }

      let message;
      if (result.state === "success") message = order ? order.message : result.message || "Your wallet has been credited.";
      else if (result.state === "pending") message = closedEarly
        ? "We haven't received this payment. If you paid by bank transfer, it can take a minute: tap \"Check again\"."
        : result.offline
          ? "We couldn't reach the server to confirm this payment. Check your internet connection, then tap \"Check again\"."
          : "Your bank hasn't confirmed this payment yet. If you were charged, it will complete automatically within a few minutes.";
      else message = result.error || "This payment was not successful. You have not been charged.";
      if (result.state === "success" && order && orderState === "failed") message = `${order.message || "The order could not be completed."} Your payment has been added to your wallet.`;

      const rows = [
        ...(order ? [["Service", order.description]] : ctx.rows),
        ["Paid with", "Flutterwave"],
        ["Reference", order?.reference || reference],
        ["Date", new Date().toLocaleString("en-NG")]
      ];
      const again = result.state === "pending" ? `<button type="button" class="ap-btn ap-btn-outline" data-ap="again">Check again</button>` : "";
      render({
        icon: ICONS[tone], tone, title,
        amount: order?.amount ?? ctx.amount, message,
        extra: tokenHtml(order) + rowsHtml(rows),
        actions: `${again}<button type="button" class="ap-btn" data-ap="done">Done</button>`
      }, ctx);

      screen.querySelectorAll(".ap-copy").forEach((b) => b.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied"; } catch (e) {}
      }));
      screen.querySelector('[data-ap="done"]').addEventListener("click", () => resolve({ action: "done" }));
      screen.querySelector('[data-ap="again"]')?.addEventListener("click", () => resolve({ action: "again" }));
    });
  }

  // data: the server's checkout response { reference, inline, authorization_url, mock }
  // ctx:  { title, amount, rows }
  async function pay(data, ctx = {}) {
    ctx = { title: ctx.title || "Payment", amount: ctx.amount, rows: ctx.rows || [] };
    const reference = data.reference;
    localStorage.setItem("pending_funding_ref", reference); // checked again if the app is closed mid-payment
    mount();
    try {
      let outcome = data.mock ? "paid" : await openCheckout(data, ctx);
      if (outcome === "unavailable") {
        render({ icon: ICONS.failed, tone: "failed", title: "Couldn't open payment", amount: ctx.amount,
          message: "Check your internet connection and try again. You have not been charged.",
          actions: '<button type="button" class="ap-btn" data-ap="done">Close</button>' }, ctx);
        await new Promise((r) => screen.querySelector('[data-ap="done"]').addEventListener("click", r));
        localStorage.removeItem("pending_funding_ref");
        return null;
      }
      let result = await confirm(reference, ctx, outcome === "paid");
      for (;;) {
        const choice = await showResult(result, ctx, reference, { closedEarly: outcome === "closed" });
        if (choice.action !== "again") break;
        result = await confirm(reference, ctx, true);
      }
      if (result.state !== "pending") localStorage.removeItem("pending_funding_ref");
      if (outcome === "closed" && result.state === "pending") localStorage.removeItem("pending_funding_ref");
      return result;
    } finally {
      unmount();
    }
  }

  // Android back button: ignored while a payment is open, so it can't be lost by accident.
  const isOpen = () => !!screen;

  if (window.Capacitor?.isNativePlatform?.()) window.AppPay = { pay, isOpen };
})();
