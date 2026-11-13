import { useStore } from "../../data/store";
import { providerOfRejection } from "../../practice/errorRoute";
import { backHomeAfterError, tryAgainAfterError, useLive } from "../../practice/live";
import Link from "../../ui/Link";
import { go } from "../../ui/router";
import StatePage from "./StatePage";

/** The provider didn't accept the saved key. In the app the buttons act on the session that hit it. */
export default function ErrorKeyRejected() {
  const mock = useStore().screens.states.keyRejected.provider;
  const live = useLive();
  const real = live.active;
  const provider = (real && providerOfRejection(live.error)) || mock;
  return (
    <StatePage
      icon="key"
      title={`${provider} didn't accept your key`}
      actions={
        <>
          <Link to="8-5-settings-ai" className="e-btn e-btn-primary e-btn-big">Check your key</Link>
          {real ? (
            <>
              <button type="button" className="e-btn e-btn-line" onClick={() => void tryAgainAfterError(go)}>Try again</button>
              <button type="button" className="e-btn e-btn-ghost" onClick={() => void backHomeAfterError(go)}>Back home</button>
            </>
          ) : (
            <>
              <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-ghost">Practice with timing only</Link>
              <Link to="2-1-home" className="e-btn e-btn-ghost">Back home</Link>
            </>
          )}
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        The key saved for {provider} was turned down. It may have a typo, have expired, or belong to an account that's out of credit.
      </p>
      <p className="e-meta" style={{ margin: 0 }}>
        Paste the key again in Settings under AI, and press Test. Then press Try again to answer this question once more.
      </p>
    </StatePage>
  );
}
