import type { SVGProps } from "react";

export const FENCE_PATH = "M4 21V6l2-3 2 3v15M10 21V6l2-3 2 3v15M16 21V6l2-3 2 3v15M2 10h20M2 16h20";

export function FenceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d={FENCE_PATH} />
    </svg>
  );
}
