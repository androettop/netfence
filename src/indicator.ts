import { findSP } from "@decky/ui";

import { FENCE_PATH } from "./icons";
import { Status, getCurrentStatus, subscribe } from "./status";

// Small fence icon in the top bar, next to the network icon, while a block is active.
// Pure DOM and best effort: if the header can't be found, nothing is shown.
const INDICATOR_ID = "netfence-indicator";
const CHECK_MS = 2000;

function describe(status: Status): string {
  if (status.block_internet && status.block_lan) return "NetFence: Internet and LAN blocked";
  if (status.block_internet) return "NetFence: LAN only";
  return "NetFence: LAN blocked";
}

function update(status: Status | null) {
  const doc = findSP()?.document;
  if (!doc) return;
  const existing = doc.getElementById(INDICATOR_ID);
  if (!status || !(status.block_internet || status.block_lan)) {
    existing?.remove();
    return;
  }
  const header = doc.getElementById("header");
  const anchor = header?.querySelector(":scope > [role=link]");
  if (!header || !anchor) return;

  const title = describe(status);
  if (existing && existing.parentElement === header && existing.nextElementSibling === anchor) {
    existing.title = title;
    return;
  }
  existing?.remove();

  const el = doc.createElement("div");
  el.id = INDICATOR_ID;
  el.title = title;
  el.className = Array.from(anchor.classList).filter((c) => c !== "Panel" && c !== "Focusable").join(" ");
  el.style.cssText = "display:flex;align-items:center;justify-content:center;color:#f5a623;pointer-events:none;";
  el.innerHTML =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px">` +
    `<path d="${FENCE_PATH}"/></svg>`;
  header.insertBefore(el, anchor);
}

function safeUpdate() {
  try {
    update(getCurrentStatus());
  } catch (e) {
    console.warn("[NetFence] indicator update failed", e);
  }
}

/** Starts the top bar indicator. Returns a cleanup function. */
export function startIndicator(): () => void {
  const unsubscribe = subscribe(safeUpdate);
  const timer = setInterval(safeUpdate, CHECK_MS);
  safeUpdate();
  return () => {
    unsubscribe();
    clearInterval(timer);
    try {
      findSP()?.document.getElementById(INDICATOR_ID)?.remove();
    } catch {
      // ignore
    }
  };
}
