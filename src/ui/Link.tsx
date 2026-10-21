import type { AnchorHTMLAttributes } from "react";
import { hrefFor } from "./router";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: string };

const isExternal = (to: string) => /^(https?:|mailto:)/.test(to);

/** A link to another screen by id ("5-1-stories"), or out to the browser or email app. */
export default function Link({ to, children, ...rest }: Props) {
  if (isExternal(to)) {
    const external = to.startsWith("http");
    return (
      <a href={to} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <a href={hrefFor(to)} {...rest}>
      {children}
    </a>
  );
}
