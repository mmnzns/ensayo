import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { isApp } from "../data/real";
import { externalClick, isExternal } from "./openExternal";
import { hrefFor } from "./router";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: string };

/** A link to another screen by id ("5-1-stories"), or out to the browser or email app. */
export default function Link({ to, children, onClick, ...rest }: Props) {
  if (isExternal(to)) {
    const external = to.startsWith("http");
    const open = externalClick(to, isApp());
    // In the app the opener plugin takes the click; in the browser the anchor does it by itself.
    const handle = (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (!e.defaultPrevented) open?.(e);
    };
    return (
      <a href={to} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} {...rest} onClick={open || onClick ? handle : undefined}>
        {children}
      </a>
    );
  }
  return (
    <a href={hrefFor(to)} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}
