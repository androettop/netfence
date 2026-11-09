import { callable } from "@decky/api";
import { useEffect, useState } from "react";

export type BlockKind = "block_lan" | "block_internet";

export interface Status {
  block_lan: boolean;
  block_internet: boolean;
}

type Listener = (status: Status | null) => void;

const getStatusCall = callable<[], Status>("get_status");
const setBlockCall = callable<[kind: BlockKind, value: boolean], Status>("set_block");

let current: Status | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener(current));
}

export function getCurrentStatus(): Status | null {
  return current;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function refreshStatus(): Promise<Status> {
  current = await getStatusCall();
  emit();
  return current;
}

export async function setBlock(kind: BlockKind, value: boolean): Promise<Status> {
  current = await setBlockCall(kind, value);
  emit();
  return current;
}

/** Shared status across the plugin panel, Quick Settings toggle and indicator. */
export function useStatus(): Status | null {
  const [status, setStatus] = useState<Status | null>(current);
  useEffect(() => {
    const unsubscribe = subscribe(setStatus);
    refreshStatus().catch(() => undefined);
    return unsubscribe;
  }, []);
  return status;
}
