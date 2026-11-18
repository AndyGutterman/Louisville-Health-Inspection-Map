// The "‹ 2 / 3 ›" arrows inside a popup when several places share one spot.
import * as AccessibleIcon from "@radix-ui/react-accessible-icon";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { useT } from "../../I18nContext.jsx";

// popups.jsx renders this in a React root of its own, outside the provider, so it passes `t`.
export default function OverlapNav({ index, total, onPrev, onNext, t: given }) {
  const context = useT();
  const t = given ?? context.t;
  return (
    <div
      className="multi-nav"
      role="group"
      aria-label={t("overlap.group", { index: index + 1, total })}
    >
      <button type="button" className="iconbtn" onClick={onPrev}>
        <AccessibleIcon.Root label={t("overlap.prev")}>
          <ChevronLeftIcon aria-hidden />
        </AccessibleIcon.Root>
      </button>
      <span aria-live="polite" className="multi-count">
        {index + 1} / {total}
      </span>
      <button type="button" className="iconbtn" onClick={onNext}>
        <AccessibleIcon.Root label={t("overlap.next")}>
          <ChevronRightIcon aria-hidden />
        </AccessibleIcon.Root>
      </button>
    </div>
  );
}
