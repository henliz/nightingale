import lock from "../../../assets/figma/icon-lock.svg";
import logo from "../../../assets/figma/icon-logo.svg";
import search from "../../../assets/figma/icon-search.svg";
import bell from "../../../assets/figma/icon-bell.svg";
import bellPlain from "../../../assets/figma/icon-bell-plain.svg";
import arrowsOut from "../../../assets/figma/icon-arrows-out.svg";
import expand from "../../../assets/figma/icon-expand.svg";
import link from "../../../assets/figma/icon-link.svg";
import file from "../../../assets/figma/icon-file.svg";
import arrow from "../../../assets/figma/icon-arrow.svg";
import chevron from "../../../assets/figma/icon-chevron.svg";

const ICONS = { lock, logo, search, bell, bellPlain, arrowsOut, expand, link, file, arrow, chevron } as const;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  /** rendered width in px, defaults to the asset's natural size */
  width?: number;
  height?: number;
  /** shorthand for a square icon */
  size?: number;
  className?: string;
}

/** static Figma-exported icon, decorative by default (alt="") */
export function Icon({ name, size, width = size, height = size, className }: IconProps) {
  return (
    <img
      src={ICONS[name]}
      alt=""
      aria-hidden="true"
      width={width}
      height={height}
      className={className}
      draggable={false}
    />
  );
}
