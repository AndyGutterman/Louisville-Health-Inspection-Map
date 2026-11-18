// The info drawer: the place's card and its inspection history. A side panel on desktop
// (its width dragged by the left edge, useDrawerWidth), a bottom sheet on phones
// (useBottomSheet). The card is InspectionCard; the history is History.
import "../../styles/Violations.css";
import "../../styles/History.css";
import "../../styles/RestaurantInfo.css";
import { regionOfId } from "../../lib/regions.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import InspectionCard from "./InspectionCard.jsx";
import History, { HistorySkeleton } from "./History.jsx";
import { useBottomSheet } from "./useBottomSheet.js";
import { useDrawerWidth } from "./useDrawerWidth.js";
import { useT } from "../../I18nContext.jsx";

// rightOffset (desktop only): px to slide left so another right-hand panel (the account panel) can sit beside it.
export default function InfoDrawer({
  selected,
  drawerLoading,
  history,
  facDetails,
  pins,
  zIndex,
  onBringToFront,
  onSwitchTo,
  onClose,
  watchlisted,
  onSaveToWatchlist,
  rightOffset = 0,
  onSheetHeight,
}) {
  const isMobile = useMediaQuery("(max-width: 600px)");
  const { t } = useT();
  const {
    sheetRef,
    bodyRef,
    snap,
    setSnap,
    sheetH,
    dragH,
    animate,
    onHandleDown,
    onHandleMove,
    onHandleUp,
  } = useBottomSheet({ isMobile, selected, history, drawerLoading, onSheetHeight, onClose });
  const { drawerW, onLeftEdgeDown, onLeftEdgeMove, onLeftEdgeUp } = useDrawerWidth();

  if (!selected) return null;
  const showGrade = regionOfId(selected.establishment_id).has.grades;

  // Mobile: bottom sheet with two resting heights (see above), dragged by its handle.
  // Desktop: full-height column between header and screen bottom, always scrollable.
  const outerStyle = isMobile
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: sheetH,
        width: "100%",
        borderRadius: "14px 14px 0 0",
        transition: dragH != null || !animate ? "none" : "height .24s cubic-bezier(.2,.8,.2,1)",
      }
    : {
        position: "fixed",
        right: 16 + rightOffset,
        top: "calc(var(--header-h, var(--mobile-header-h, 64px)) + 10px)",
        bottom: 16,
        // Never run off the left edge when another panel is beside us
        width: Math.max(300, Math.min(drawerW, window.innerWidth - 16 - rightOffset - 24)),
        borderRadius: 12,
        transition: "right .24s ease",
      };

  return (
    <div
      ref={sheetRef}
      data-testid="info-drawer"
      className="info-drawer"
      onPointerDown={onBringToFront}
      style={{
        ...outerStyle,
        background: "rgba(18,18,22,0.97)",
        backdropFilter: "blur(8px)",
        color: "#fff",
        zIndex: zIndex ?? 3000,
        boxShadow: isMobile ? "0 -8px 32px rgba(0,0,0,0.55)" : "0 10px 30px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      onPointerMove={!isMobile ? onLeftEdgeMove : undefined}
      onPointerUp={!isMobile ? onLeftEdgeUp : undefined}
      onPointerCancel={!isMobile ? onLeftEdgeUp : undefined}
    >
      {/* Left-edge resize handle — desktop only */}
      {!isMobile && (
        <div
          aria-hidden="true"
          onPointerDown={onLeftEdgeDown}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: "ew-resize",
            zIndex: 10,
            touchAction: "none",
            userSelect: "none",
            borderRadius: "12px 0 0 12px",
            background: "linear-gradient(to right, rgba(255,255,255,.10), transparent)",
            transition: "background .15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background =
              "linear-gradient(to right, rgba(255,255,255,.28), transparent)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background =
              "linear-gradient(to right, rgba(255,255,255,.10), transparent)")
          }
        />
      )}

      {/* Phone only: drag handle. Drag up to expand, down to collapse or close; a tap toggles. */}
      {isMobile && (
        <div
          data-testid="drawer-handle"
          role="button"
          tabIndex={0}
          aria-label={snap === "peek" ? t("drawer.expand") : t("drawer.collapseDetails")}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ")
              setSnap((cur) => (cur === "peek" ? "expanded" : "peek"));
          }}
          style={{
            flexShrink: 0,
            height: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "grab",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          <span
            style={{
              width: 40,
              height: 4,
              borderRadius: 999,
              background: "rgba(255,255,255,0.28)",
            }}
          />
        </div>
      )}

      {/* Veil removed — skeleton in history section serves as the loading indicator */}

      {/* Scrollable inner body.
          flex:1 + minHeight:0 lets it grow to fill on desktop (bounded by top+bottom),
          and on mobile sizes to content while still being scrollable if tall. */}
      <div
        ref={bodyRef}
        className="info-drawer-body"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          // Always reserve the scrollbar's space so the content width doesn't
          // change (and the name/address don't re-wrap) when "More info"
          // expands the body past the scroll threshold.
          scrollbarGutter: "stable",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          padding: isMobile ? "16px 16px 48px" : "24px 24px 60px",
        }}
      >
        <InspectionCard
          data={{
            establishment_id: selected.establishment_id,
            name: selected.name,
            address: selected.address,
            inspectionDate: selected.inspectionDate,
            score: selected.score,
            grade: selected.grade,
            meta: selected.meta,
            metaTitle: selected.metaTitle,
            similarNearby: selected.similarNearby,
            noLocation: selected.noLocation,
            sourceNote: selected.sourceNote,
            dateCaption: selected.dateCaption,
            // Only Louisville Metro issues letter grades (lib/regions.js has.grades).
            showGrade,
          }}
          details={facDetails}
          pins={pins}
          onSwitchTo={onSwitchTo}
          watchlisted={watchlisted}
          onSaveToWatchlist={onSaveToWatchlist}
          onClose={onClose}
        />

        <div className="inspect-card_spacer" />

        {/* History: show green-scan skeleton while loading, real rows once ready */}
        {drawerLoading && !history ? (
          <HistorySkeleton />
        ) : history ? (
          <History rows={history} pins={pins} showGrade={showGrade} />
        ) : null}
      </div>
    </div>
  );
}
