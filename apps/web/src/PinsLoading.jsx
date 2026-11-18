// A small pill in the corner while map pins are still arriving (useMapFeatures), and a
// note if some of them couldn't load. Gone once everything is in. Retry reads only the
// counties that failed: reloading the page would download the ones that worked again.
import React from "react";
import "./styles/PinsLoading.css";
import { useT } from "./I18nContext.jsx";

export default function PinsLoading({ status, onRetry }) {
  const { t } = useT();
  if (status.failed) {
    return (
      <div className="pins-loading pins-loading--failed" role="status" data-testid="pins-loading">
        {t("loadingPins.failed")}
        <button type="button" className="pins-loading-retry" onClick={onRetry}>
          {t("loadingPins.retry")}
        </button>
      </div>
    );
  }
  if (!status.loading) return null;
  return (
    <div className="pins-loading" role="status" data-testid="pins-loading">
      <span className="pins-loading-spinner" aria-hidden="true" />
      {status.places
        ? t("loadingPins.loadingCount", { count: status.places.toLocaleString() })
        : t("loadingPins.loading")}
    </div>
  );
}
