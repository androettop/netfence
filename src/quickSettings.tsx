import { PanelSectionRow, ToggleField, findInReactTree, getReactRoot } from "@decky/ui";

import { FenceIcon } from "./icons";
import { SilentBoundary } from "./silentBoundary";
import { setBlock, useStatus } from "./status";

// Steam internals change between client versions. Everything here is best effort:
// if anything can't be found, the toggle simply doesn't show up.
const SETTINGS_PANEL_MARKER = "GetControllers";
const AIRPLANE_TOGGLE_MARKER = "SetAirplaneMode";
const TOGGLE_KEY = "netfence-lan-only";
const RETRY_MS = 2000;
const MAX_ATTEMPTS = 60;

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

const isSettingsTab = (tab: any): boolean => {
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

/** Adds a "LAN only" toggle under Airplane Mode in Quick Settings. Returns a cleanup function. */
export function patchQuickSettings(): () => void {
  let tab: any = null;
  let original: any = null;
  let patched: any = null;
  let attempts = 0;

  const tryPatch = (): boolean => {
    try {
      tab = findSettingsTab();
      if (!tab) return false;
      original = tab.panel.type;
      const Original = original;
      patched = function NetFenceQuickSettings(props: any) {
        const tree = Original(props);
        try {
          insertToggle(tree);
        } catch (e) {
          console.warn("[NetFence] Quick Settings patch failed", e);
        }
        return tree;
      };
      tab.panel.type = patched;
      return true;
    } catch (e) {
      console.warn("[NetFence] Quick Settings patch unavailable", e);
      return false;
    }
  };

  const timer = tryPatch()
    ? null
    : setInterval(() => {
        if (tryPatch() || ++attempts >= MAX_ATTEMPTS) clearInterval(timer!);
      }, RETRY_MS);

  return () => {
    if (timer) clearInterval(timer);
    try {
      if (tab?.panel?.type === patched) tab.panel.type = original;
    } catch {
      // ignore
    }
  };
}
