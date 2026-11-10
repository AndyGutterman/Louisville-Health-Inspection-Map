import React from "react";
import "./styles/AdjustFilter.css";
import { useMediaQuery } from "./hooks/useMediaQuery.js";
import { useLatest } from "./hooks/useLatest.js";
import { RED_CAP, SCORE_MIN as LO, YEL_CAP } from "./lib/scoring.js";

const HI = 100;
// While a handle is dragged the sliders follow the pointer at once, and the map (which
// re-filters every pin) gets the new cut-offs at most this often, then once on release.
const MAP_UPDATE_MS = 60;

const clamp = (n, a, b) => Math.max(a, Math.min(b, Math.round(n)));
const toPct = (v) => ((v - LO) * 100) / (HI - LO);

export function ScoreThresholdInline({ pins, setPins, preset, applyPreset }) {
  // The cut-offs under the pointer while a handle is dragged; null otherwise.
  const [draft, setDraft] = React.useState(null);
  const [rMax, yMax] = draft || pins || [86, 94];
  const current = useLatest([rMax, yMax]); // drag handlers outlive the render they began in
  const isMobile = useMediaQuery("(max-width: 640px)");
  const gap = isMobile ? 6 : 10;

  const dragging = React.useRef(false);
  const waiting = React.useRef(null); // cut-offs not yet sent to the map
  const timer = React.useRef(null);
  const sendToMap = () => {
    clearTimeout(timer.current);
    timer.current = null;
    if (waiting.current) setPins(waiting.current);
    waiting.current = null;
  };
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const change = (next) => {
    if (!dragging.current) {
      setPins(next); // arrow keys
      return;
    }
    setDraft(next);
    waiting.current = next;
    timer.current ??= setTimeout(sendToMap, MAP_UPDATE_MS);
  };
  const onDragStart = () => {
    dragging.current = true;
    setDraft(current.current);
  };
  const onDragEnd = () => {
    dragging.current = false;
    sendToMap();
    setDraft(null);
  };

  const setR = (v) => {
    const [, y] = current.current;
    change([clamp(v, LO, Math.min(RED_CAP, y - 1)), y]);
  };
  const setYL = (v) => setR(v);
  const setYR = (v) => {
    const [r] = current.current;
    change([r, clamp(v, Math.max(r + 1, LO + 1), YEL_CAP)]);
  };
  const setGMin = (v) => {
    const [r] = current.current;
    change([r, clamp(v, Math.max(r + 2, LO + 1), HI) - 1]);
  };
  const drag = { onDragStart, onDragEnd };

  const lefts = { red: LO, yellow: rMax + 1, green: yMax + 1 };
  const rights = { red: rMax, yellow: yMax, green: HI };

  const onPreset = (key) => applyPreset?.(key);

  return (
    <div className={`wb2 ${draft ? "dragging" : ""}`} style={{ display: "grid", gap }}>
      <div
        className="wb2-presets"
        style={{
          display: "flex",
          flexDirection: "row",
          gap,
          justifyContent: "space-between",
          width: "100%",
          marginBottom: gap,
        }}
      >
        <button
          type="button"
          className={`wb2-pill ${preset === "loose" ? "active" : ""}`}
          onClick={() => onPreset("loose")}
          style={{ flex: 1, padding: isMobile ? "6px 8px" : "8px 12px", whiteSpace: "nowrap" }}
        >
          Loose
        </button>
        <button
          type="button"
          className={`wb2-pill ${preset === "balanced" ? "active" : ""}`}
          onClick={() => onPreset("balanced")}
          style={{ flex: 1, padding: isMobile ? "6px 8px" : "8px 12px", whiteSpace: "nowrap" }}
        >
          Balanced
        </button>
        <button
          type="button"
          className={`wb2-pill ${preset === "strict" ? "active" : ""}`}
          onClick={() => onPreset("strict")}
          style={{ flex: 1, padding: isMobile ? "6px 8px" : "8px 12px", whiteSpace: "nowrap" }}
        >
          Strict
        </button>
      </div>

      <RowSingle
        color="red"
        leftLabel={lefts.red}
        rightLabel={rights.red}
        value={rMax}
        onChange={setR}
        fillLeftPct={0}
        fillRightPct={100 - toPct(rMax)}
        compact={isMobile}
        {...drag}
      />

      <RowDual
        color="yellow"
        leftLabel={lefts.yellow}
        rightLabel={rights.yellow}
        leftValue={rMax + 1}
        rightValue={yMax}
        onLeft={(v) => setYL(v - 1)}
        onRight={setYR}
        compact={isMobile}
        {...drag}
      />

      <RowSingle
        color="green"
        leftLabel={lefts.green}
        rightLabel={rights.green}
        value={yMax + 1}
        onChange={setGMin}
        fillLeftPct={toPct(yMax + 1)}
        fillRightPct={0}
        compact={isMobile}
        {...drag}
      />
    </div>
  );
}

function RowSingle({
  color,
  leftLabel,
  rightLabel,
  value,
  onChange,
  fillLeftPct,
  fillRightPct,
  compact,
  onDragStart,
  onDragEnd,
}) {
  const trackRef = React.useRef(null);
  const [drag, setDrag] = React.useState(false);
  const posPct = toPct(value);

  const toValue = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const t = (clientX - rect.left) / rect.width;
    return LO + t * (HI - LO);
  };

  const start = (e) => {
    e.preventDefault();
    setDrag(true);
    onDragStart?.();
    const id = e.pointerId;
    e.currentTarget.setPointerCapture?.(id);
    let raf = null;
    let x = e.clientX;

    // At most one update per animation frame, always with the pointer's latest position.
    const mv = (ev) => {
      x = ev.clientX;
      raf ??= requestAnimationFrame(() => {
        raf = null;
        onChange(Math.round(toValue(x)));
      });
    };
    const up = () => {
      setDrag(false);
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
        onChange(Math.round(toValue(x))); // the move still waiting for its frame
      }
      onDragEnd?.();
      try {
        e.currentTarget.releasePointerCapture?.(id);
      } catch {
        /* pointer capture already released */
      }
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };

    window.addEventListener("pointermove", mv, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const key = (e) => {
    if (e.key === "ArrowLeft") onChange(value - 1);
    if (e.key === "ArrowRight") onChange(value + 1);
  };

  return (
    <div
      className="wb2-row"
      style={{
        display: "grid",
        gridTemplateColumns: "36px 1fr 36px",
        alignItems: "center",
        gap: compact ? 6 : 10,
      }}
    >
      <div className="wb2-left" style={{ textAlign: "left" }}>
        {leftLabel}
      </div>
      <div className={`wb2-track ${color}`} ref={trackRef} style={{ width: "100%" }}>
        <div className="wb2-rail" />
        <div
          className={`wb2-fill ${color}`}
          style={{ left: `${fillLeftPct}%`, right: `${fillRightPct}%` }}
        />
        <button
          type="button"
          className={`wb2-handle ${drag ? "active" : ""}`}
          style={{ left: `calc(${posPct}% )` }}
          onPointerDown={start}
          onKeyDown={key}
          role="slider"
          aria-valuemin={LO}
          aria-valuemax={HI}
          aria-valuenow={value}
          aria-label={`${color} handle`}
        >
          <span className="wb2-thumb" />
        </button>
      </div>
      <div className="wb2-right" style={{ textAlign: "right" }}>
        {rightLabel}
      </div>
    </div>
  );
}

function RowDual({
  color,
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  onLeft,
  onRight,
  compact,
  onDragStart,
  onDragEnd,
}) {
  const trackRef = React.useRef(null);
  const [active, setActive] = React.useState(null);
  const leftPct = toPct(leftValue);
  const rightPct = toPct(rightValue);

  const toValue = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const t = (clientX - rect.left) / rect.width;
    return LO + t * (HI - LO);
  };

  const start = (which, e) => {
    e.preventDefault();
    setActive(which);
    onDragStart?.();
    const id = e.pointerId;
    e.currentTarget.setPointerCapture?.(id);
    let raf = null;
    let x = e.clientX;
    const move = () => (which === "L" ? onLeft : onRight)(Math.round(toValue(x)));

    const mv = (ev) => {
      x = ev.clientX;
      raf ??= requestAnimationFrame(() => {
        raf = null;
        move();
      });
    };
    const up = () => {
      setActive(null);
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
        move(); // the move still waiting for its frame
      }
      onDragEnd?.();
      try {
        e.currentTarget.releasePointerCapture?.(id);
      } catch {
        /* pointer capture already released */
      }
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };

    window.addEventListener("pointermove", mv, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const keyL = (e) => {
    if (e.key === "ArrowLeft") onLeft(leftValue - 1);
    if (e.key === "ArrowRight") onLeft(leftValue + 1);
  };
  const keyR = (e) => {
    if (e.key === "ArrowLeft") onRight(rightValue - 1);
    if (e.key === "ArrowRight") onRight(rightValue + 1);
  };

  return (
    <div
      className="wb2-row"
      style={{
        display: "grid",
        gridTemplateColumns: "36px 1fr 36px",
        alignItems: "center",
        gap: compact ? 6 : 10,
      }}
    >
      <div className="wb2-left" style={{ textAlign: "left" }}>
        {leftLabel}
      </div>
      <div className={`wb2-track ${color}`} ref={trackRef} style={{ width: "100%" }}>
        <div className="wb2-rail" />
        <div
          className={`wb2-fill ${color}`}
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
        />
        <button
          type="button"
          className={`wb2-handle ${active === "L" ? "active" : ""}`}
          style={{ left: `calc(${leftPct}% )` }}
          onPointerDown={(e) => start("L", e)}
          onKeyDown={keyL}
          role="slider"
          aria-valuemin={LO}
          aria-valuemax={HI}
          aria-valuenow={leftValue}
          aria-label="yellow left"
        >
          <span className="wb2-thumb" />
        </button>
        <button
          type="button"
          className={`wb2-handle ${active === "R" ? "active" : ""}`}
          style={{ left: `calc(${rightPct}% )` }}
          onPointerDown={(e) => start("R", e)}
          onKeyDown={keyR}
          role="slider"
          aria-valuemin={LO}
          aria-valuemax={HI}
          aria-valuenow={rightValue}
          aria-label="yellow right"
        >
          <span className="wb2-thumb" />
        </button>
      </div>
      <div className="wb2-right" style={{ textAlign: "right" }}>
        {rightLabel}
      </div>
    </div>
  );
}

export default function ScoreThreshold() {
  return null;
}
