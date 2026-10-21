import { useEffect, useRef, useState } from "react";
import { useStore } from "../../data/store";
import Link from "../../ui/Link";
import { formatStamp } from "./format";
import StatePage from "./StatePage";

/** Something unexpected went wrong: copy the details, go home. */
export default function GenericError() {
  const { version, system, at, message } = useStore().screens.states.genericError;
  const details = `Ensayo ${version} · ${system} · ${formatStamp(at)}\n${message}`;
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(details);
    } catch {
      // No clipboard access: the details stay on screen to select by hand.
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <StatePage
      icon="alert"
      title="Something went wrong"
      headerAction={<span />}
      actions={
        <>
          <Link to="2-1-home" className="e-btn e-btn-primary e-btn-big">Back home</Link>
          <button type="button" className="e-btn e-btn-line" onClick={copy}>{copied ? "Copied" : "Copy details"}</button>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        Ensayo ran into a problem it didn't expect. Your stories, applications and past practice are still on this computer.
      </p>
      <p className="e-meta" style={{ margin: 0 }}>
        If it happens again, copy the details and <Link to="9-1-feedback">send them as feedback</Link>. The details hold no answers, stories or recordings.
      </p>
      <pre style={{ margin: 0, padding: "12px 14px", borderRadius: "var(--e-r-sm)", background: "var(--e-highlight)", color: "var(--e-warn-ink)", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12px", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {details}
      </pre>
      <span role="status" className="e-small" style={{ minHeight: "18px" }}>{copied ? "Copied to your clipboard." : ""}</span>
    </StatePage>
  );
}
