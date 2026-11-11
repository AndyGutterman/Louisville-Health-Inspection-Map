// A small pill in the corner while map pins are still arriving (useMapFeatures), and a
// note if some of them couldn't load. Gone once everything is in.
import React from "react";
import "./styles/PinsLoading.css";

export default function PinsLoading({ status }) {
  if (status.failed) {
    return (
      <div className="pins-loading pins-loading--failed" role="status" data-testid="pins-loading">
        Some places couldn&apos;t load.
        <button type="button" className="pins-loading-retry" onClick={() => location.reload()}>
          Retry
        </button>
      </div>
    );
  }
  if (!status.loading) return null;
  return (
    <div className="pins-loading" role="status" data-testid="pins-loading">
      <span className="pins-loading-spinner" aria-hidden="true" />
      {status.places ? `Loading places… ${status.places.toLocaleString()}` : "Loading places…"}
    </div>
  );
}
