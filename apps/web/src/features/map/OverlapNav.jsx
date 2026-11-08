// The "‹ 2 / 3 ›" arrows inside a popup when several places share one spot.
import * as AccessibleIcon from "@radix-ui/react-accessible-icon";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";

export default function OverlapNav({ index, total, onPrev, onNext }) {
  return (
    <div
      className="multi-nav"
      role="group"
      aria-label={`Overlapping locations, item ${index + 1} of ${total}`}
    >
      <button type="button" className="iconbtn" onClick={onPrev}>
        <AccessibleIcon.Root label="Previous location">
          <ChevronLeftIcon aria-hidden />
        </AccessibleIcon.Root>
      </button>
      <span aria-live="polite" className="multi-count">
        {index + 1} / {total}
      </span>
      <button type="button" className="iconbtn" onClick={onNext}>
        <AccessibleIcon.Root label="Next location">
          <ChevronRightIcon aria-hidden />
        </AccessibleIcon.Root>
      </button>
    </div>
  );
}
