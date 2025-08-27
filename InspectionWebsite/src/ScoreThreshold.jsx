import React from "react";
import "./styles/AdjustFilter.css";

const LO = 70;
const HI = 100;
const RED_CAP = 98;
const YEL_CAP = 99;

const clamp = (n, a, b) => Math.max(a, Math.min(b, Math.round(n)));
const toPct = (v) => ((v - LO) * 100) / (HI - LO);

function useIsMobile() {
  const get = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  const [mobile, setMobile] = React.useState(get);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => setMobile(mq.matches);
    try {
      mq.addEventListener("change", onChange);
    } catch {
      mq.addListener(onChange);
    }
    return () => {
      try {
        mq.removeEventListener("change", onChange);
      } catch {
        mq.removeListener(onChange);
      }
    };
  }, []);
  return mobile;
}

export function ScoreThresholdInline({ pins, setPins, preset, applyPreset }) {
  const [rMax, yMax] = pins || [86, 94];
  const isMobile = useIsMobile();
  const gap = isMobile ? 6 : 10;

  const setR = (v) => {
    const next = clamp(v, LO, Math.min(RED_CAP, yMax - 1));
    setPins([next, yMax]);
  };
  const setYL = (v) => setR(v);
  const setYR = (v) => {
    const next = clamp(v, Math.max(rMax + 1, LO + 1), YEL_CAP);
    setPins([rMax, next]);
  };
  const setGMin = (v) => {
    const g = clamp(v, Math.max(rMax + 2, LO + 1), HI);
    setPins([rMax, g - 1]);
  };

  const lefts = { red: LO, yellow: rMax + 1, green: yMax + 1 };
  const rights = { red: rMax, yellow: yMax, green: HI };

  const onPreset = (key) => applyPreset?.(key);

  return (
    <div className="wb2" style={{ display: "grid", gap }}>
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
          className={`wb2-pill ${preset == null || preset === "balanced" ? "active" : ""}`}
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
    const id = e.pointerId;
    e.currentTarget.setPointerCapture?.(id);

    const mv = (ev) => onChange(Math.round(toValue(ev.clientX)));
    const up = () => {
      setDrag(false);
      try { e.currentTarget.releasePointerCapture?.(id); } catch {}
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
    const id = e.pointerId;
    e.currentTarget.setPointerCapture?.(id);

    const mv = (ev) => {
      const v = Math.round(toValue(ev.clientX));
      if (which === "L") onLeft(v);
      else onRight(v);
    };
    const up = () => {
      setActive(null);
      try { e.currentTarget.releasePointerCapture?.(id); } catch {}
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
