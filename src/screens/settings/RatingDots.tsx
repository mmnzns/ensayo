// A rating from 1 to 3 as three dots, the way Talaan shows a speech model's speed and accuracy: the label, then dots that
// are filled up to the rating. Plain component, so every rating can be checked without the app.
import { ratingOf } from "./speechModels";

const dot = (filled: boolean) => ({ width: "8px", height: "8px", borderRadius: "50%", flex: "none" as const, background: filled ? "var(--e-primary)" : "var(--e-line)" });

export default function RatingDots({ label, n }: { label: string; n: number }) {
  const rating = ratingOf(n) ?? 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <span>{label}</span>
      <span role="img" aria-label={`${label} ${rating} of 3`} style={{ display: "inline-flex", gap: "3px" }}>
        {[1, 2, 3].map((i) => (
          <span key={i} data-filled={i <= rating ? "yes" : "no"} style={dot(i <= rating)} />
        ))}
      </span>
    </span>
  );
}

/** Speed and accuracy side by side, with where the model runs on this computer after the speed. */
export function Ratings({ speed, accuracy, where }: { speed: number; accuracy: number; where: string | null }) {
  return (
    <span className="e-small" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 16px" }}>
      <RatingDots label="Speed" n={speed} />
      {where ? <span>{where}</span> : null}
      <RatingDots label="Accuracy" n={accuracy} />
    </span>
  );
}
