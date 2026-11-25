import { PanelSectionRow, ToggleField, findInReactTree, getReactRoot } from "@decky/ui";

import { FenceIcon } from "./icons";
import { SilentBoundary } from "./silentBoundary";
import { setBlock, useStatus } from "./status";

// Steam internals change between client versions. Everything here is best effort:
// if anything can't be found, the toggle simply doesn't show up.
const SETTINGS_PANEL_MARKER = "GetControllers";
const AIRPLANE_TOGGLE_MARKER = "SetAirplaneMode";
const TOGGLE_KEY = "netfence-lan-only";
// Steam can mount Quick Settings late or swap its component, so keep checking forever.
// A check walks the React fiber tree, which takes a couple of milliseconds.
const CHECK_MS = 3000;
const PATCHED = Symbol("netfence-patched");

const sourceCache = new WeakMap<Function, string>();

function fnSource(fn: unknown): string {
  if (typeof fn !== "function") return "";
  let src = sourceCache.get(fn);
  if (src === undefined) {
    try {
      src = Function.prototype.toString.call(fn);
    } catch {
      src = "";
    }
    sourceCache.set(fn, src);
  }
  return src;
}

const isPatched = (type: any): boolean => !!type?.[PATCHED];

const isSettingsTab = (tab: any): boolean => {
  if (isPatched(tab?.panel?.type)) return true;
  const src = fnSource(tab?.panel?.type);
  return src.includes(SETTINGS_PANEL_MARKER) && !src.startsWith("class");
};

const isAirplaneToggle = (el: any): boolean => fnSource(el?.type).includes(AIRPLANE_TOGGLE_MARKER);

function findSettingsTab(): any {
  const root = getReactRoot(document.getElementById("root") as any);
  const stack: any[] = root ? [root] : [];
  for (let visited = 0; stack.length && visited < 100000; visited++) {
    const fiber = stack.pop();
    const tabs = fiber?.memoizedProps?.tabs;
    if (Array.isArray(tabs)) {
      const tab = tabs.find(isSettingsTab);
      if (tab) return tab;
    }
    if (fiber?.sibling) stack.push(fiber.sibling);
    if (fiber?.child) stack.push(fiber.child);
  }
  return null;
}

function LanOnlyToggle() {
  const status = useStatus();
  return (
    <PanelSectionRow>
      <ToggleField
        label="LAN only"
        icon={<FenceIcon />}
        checked={!!status?.block_internet}
        disabled={!status}
        onChange={(value: boolean) => {
          setBlock("block_internet", value).catch((e) => console.warn("[NetFence]", e));
        }}
      />
    </PanelSectionRow>
  );
}

function insertToggle(tree: any) {
  const section = findInReactTree(
    tree,
    (node: any) => Array.isArray(node?.props?.children) && node.props.children.some(isAirplaneToggle),
  );
  if (!section) return;
  const children: any[] = section.props.children;
  if (children.some((child) => child?.key === TOGGLE_KEY)) return;
  const index = children.findIndex(isAirplaneToggle);
  section.props.children = [
    ...children.slice(0, index + 1),
    <SilentBoundary key={TOGGLE_KEY}>
      <LanOnlyToggle />
    </SilentBoundary>,
    ...children.slice(index + 1),
  ];
}

// One wrapper per original component so React sees a stable type across re-patches.
const wrappers = new WeakMap<Function, Function>();

function wrap(Original: any): Function {
  let wrapper = wrappers.get(Original);
  if (!wrapper) {
    wrapper = function NetFenceQuickSettings(props: any) {
      const tree = Original(props);
      try {
        insertToggle(tree);
      } catch (e) {
        console.warn("[NetFence] Quick Settings patch failed", e);
      }
      return tree;
    };
    (wrapper as any)[PATCHED] = Original;
    wrappers.set(Original, wrapper);
  }
  return wrapper;
}

/** Adds a "LAN only" toggle under Airplane Mode in Quick Settings. Returns a cleanup function. */
export function patchQuickSettings(): () => void {
  const patchedTabs = new Set<any>();

  const ensurePatched = () => {
    try {
      const tab = findSettingsTab();
      if (!tab || isPatched(tab.panel.type)) return;
      tab.panel.type = wrap(tab.panel.type);
      patchedTabs.add(tab);
    } catch {
      // Best effort: try again on the next check.
    }
  };

  ensurePatched();
  const timer = setInterval(ensurePatched, CHECK_MS);

  return () => {
    clearInterval(timer);
    patchedTabs.forEach((tab) => {
      try {
        const original = tab?.panel?.type?.[PATCHED];
        if (original) tab.panel.type = original;
      } catch {
        // ignore
      }
    });
  };
}
