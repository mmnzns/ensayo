import { useStore } from "../../data/store";
import Link from "../../ui/Link";
import StatePage from "./StatePage";

/** The provider didn't accept the saved key. */
export default function ErrorKeyRejected() {
  const { provider } = useStore().screens.states.keyRejected;
  return (
    <StatePage
      icon="key"
      title={`${provider} didn't accept your key`}
      actions={
        <>
          <Link to="8-5-settings-ai" className="e-btn e-btn-primary e-btn-big">Check your key</Link>
          <Link to="3-1-practice-interviewer-asking" className="e-btn e-btn-ghost">Practice with timing only</Link>
        </>
      }
    >
      <p className="e-body" style={{ margin: 0 }}>
        The key saved for {provider} was turned down. It may have a typo, have expired, or belong to an account that's out of credit.
      </p>
      <p className="e-meta" style={{ margin: 0 }}>
        Practice keeps working in the meantime, with timing, length and filler words. Paste the key again in Settings under AI, and press Test.
      </p>
    </StatePage>
  );
}
