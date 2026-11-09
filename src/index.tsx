import { PanelSection, PanelSectionRow, ToggleField, staticClasses } from "@decky/ui";
import { definePlugin } from "@decky/api";
import { useState } from "react";

import { FenceIcon } from "./icons";
import { startIndicator } from "./indicator";
import { patchQuickSettings } from "./quickSettings";
import { BlockKind, refreshStatus, setBlock, useStatus } from "./status";

function Content() {
  const status = useStatus();
  const [error, setError] = useState<string | null>(null);

  const toggle = (kind: BlockKind) => async (value: boolean) => {
    try {
      await setBlock(kind, value);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <PanelSection>
      <PanelSectionRow>
        <ToggleField
          label="Block Internet"
          description="Steam and games can't reach the Internet."
          checked={!!status?.block_internet}
          disabled={!status}
          onChange={toggle("block_internet")}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Block LAN"
          description="Steam and games can't reach your local network."
          checked={!!status?.block_lan}
          disabled={!status}
          onChange={toggle("block_lan")}
        />
      </PanelSectionRow>
      {error && (
        <PanelSectionRow>
          <div style={{ fontSize: "12px", color: "#ff6b6b" }}>Error: {error}</div>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}

export default definePlugin(() => {
  refreshStatus().catch(() => undefined);

  const cleanups: Array<() => void> = [];
  for (const start of [patchQuickSettings, startIndicator]) {
    try {
      cleanups.push(start());
    } catch (e) {
      console.warn("[NetFence] optional UI integration failed", e);
    }
  }

  return {
    name: "NetFence",
    titleView: <div className={staticClasses.Title}>NetFence</div>,
    content: <Content />,
    icon: <FenceIcon width="1em" height="1em" />,
    onDismount() {
      cleanups.forEach((cleanup) => {
        try {
          cleanup();
        } catch {
          // ignore
        }
      });
    },
  };
});
