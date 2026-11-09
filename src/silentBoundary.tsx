import { Component } from "react";
import type { ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

/** Renders nothing instead of crashing Steam's UI if a child throws. */
export class SilentBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[NetFence] UI component failed", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
