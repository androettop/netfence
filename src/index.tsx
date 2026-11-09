import { PanelSection, PanelSectionRow, ToggleField, staticClasses } from "@decky/ui";
import { callable, definePlugin } from "@decky/api";
import { useEffect, useState } from "react";

type BlockKind = "block_lan" | "block_internet";

interface Status {
  block_lan: boolean;
  block_internet: boolean;
}

const getStatus = callable<[], Status>("get_status");
const setBlock = callable<[kind: BlockKind, value: boolean], Status>("set_block");

function Content() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStatus().then(setStatus).catch((e) => setError(String(e)));
  }, []);

  const toggle = (kind: BlockKind) => async (value: boolean) => {
    try {
      setStatus(await setBlock(kind, value));
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

function FenceIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 21V6l2-3 2 3v15M10 21V6l2-3 2 3v15M16 21V6l2-3 2 3v15M2 10h20M2 16h20" />
    </svg>
  );
}

export default definePlugin(() => ({
  name: "NetFence",
  titleView: <div className={staticClasses.Title}>NetFence</div>,
  content: <Content />,
  icon: <FenceIcon />,
}));
