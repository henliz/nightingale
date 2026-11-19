import logo from "../../../assets/figma/icon-logo.svg";

interface LogoProps {
  width: number;
  height: number;
}

/** the dove-N mark, drawn at its real 1.6:1 shape */
export function Logo({ width, height }: LogoProps) {
  return <img src={logo} alt="" aria-hidden="true" width={width} height={height} draggable={false} style={{ flexShrink: 0 }} />;
}
