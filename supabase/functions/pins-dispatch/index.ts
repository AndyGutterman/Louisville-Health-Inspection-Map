// pins-dispatch: starts the "Pin fixes" GitHub workflow when the pin control center's
// "Geocode now" button is pressed (docs/PINS.md), so the address fixes waiting in
// place_fixes are looked up in a minute or two instead of on the next daily run.
//
// It changes nothing itself: the fixes are already saved, and the workflow reads them
// with the service-role key. Who may call it and the secrets it needs (the same token as
// email-dispatch): ../_shared/dispatch.ts.
import { dispatchHandler } from "../_shared/dispatch.ts";

Deno.serve(dispatchHandler({ workflow: "pin-fixes.yml", userAgent: "lfs-pins-dispatch" }));
