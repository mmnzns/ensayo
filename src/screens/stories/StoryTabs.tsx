import type { Story } from "../../data/types";
import { useStore } from "../../data/store";
import { withParams } from "../../data/selection";
import Link from "../../ui/Link";
import { angleCount } from "./angles";
import { chooseStory } from "./selection";

/** "Story" and "Angles · N": the two tabs on one story. */
export default function StoryTabs({ story, current }: { story: Story; current: "story" | "angles" }) {
  const { targets } = useStore();
  const on = { background: "var(--e-tint)", color: "var(--e-ink)" } as const;
  return (
    <nav style={{ display: "flex", gap: "6px", background: "var(--e-surface)", borderRadius: "14px", padding: "4px", boxShadow: "var(--e-shadow)", alignSelf: "flex-start" }} aria-label="Story sections">
      <Link to={withParams("5-4-story", { story: story.id })} onClick={() => chooseStory(story.id)} aria-current={current === "story" ? "page" : undefined} className={current === "story" ? "e-btn e-btn-sm" : "e-btn e-btn-sm e-btn-ghost"} style={current === "story" ? on : undefined}>
        Story
      </Link>
      <Link to={withParams("5-5-story-angles", { story: story.id })} onClick={() => chooseStory(story.id)} aria-current={current === "angles" ? "page" : undefined} className={current === "angles" ? "e-btn e-btn-sm" : "e-btn e-btn-sm e-btn-ghost"} style={current === "angles" ? on : undefined}>
        {`Angles · ${angleCount(story, targets)}`}
      </Link>
    </nav>
  );
}
