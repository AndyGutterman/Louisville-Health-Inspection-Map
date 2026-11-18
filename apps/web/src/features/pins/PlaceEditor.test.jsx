// @vitest-environment jsdom
// The pin control center's editor for one place: it shows the source's address as it is,
// and each fix sends the database what lib/pinQueue.js fixArgs says. The map is a
// stand-in (MapLibre needs WebGL); a pasted latitude, longitude places the pin instead.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PlaceEditor from "./PlaceEditor.jsx";
import { clearPlaceFix, savePlaceFix } from "../../api/pins.js";

vi.mock("../../api/pins.js", () => ({ savePlaceFix: vi.fn(), clearPlaceFix: vi.fn() }));
vi.mock("./PinMap.jsx", () => ({
  default: ({ point }) => (
    <div data-testid="pin-map">{point ? `${point.kind} ${point.lat}, ${point.lon}` : "none"}</div>
  ),
}));

const PLACE = {
  id: "oldham-111",
  region: "oldham",
  name: "ASH CAFE",
  address: "3000 ASH AVE.",
  city: "PEEWEE VALLEY",
  lon: null,
  lat: null,
  provider: null,
  last_inspected: "2026-10-01",
  bucket: "missing",
  same_address: ["oldham-112"],
};

let onDone;
beforeEach(() => {
  onDone = vi.fn();
  savePlaceFix.mockResolvedValue(1);
  clearPlaceFix.mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const field = (name) => screen.getByLabelText(name);
const button = (name) => screen.getByRole("button", { name });

describe("PlaceEditor", () => {
  it("shows the address as the source lists it, and where the pin stands", () => {
    render(<PlaceEditor place={PLACE} onDone={onDone} />);
    expect(screen.getByTestId("source-address").textContent).toBe("3000 ASH AVE., PEEWEE VALLEY");
    expect(screen.getByText("No pin")).toBeTruthy();
    expect(screen.getByTestId("pin-map").textContent).toBe("none");
  });

  it("saves a corrected town for the geocoder", async () => {
    render(<PlaceEditor place={PLACE} onDone={onDone} />);
    fireEvent.change(field("Town"), { target: { value: "PEWEE VALLEY" } });
    fireEvent.click(button("Save address"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(savePlaceFix).toHaveBeenCalledWith({
      p_place_id: "oldham-111",
      p_action: "address",
      p_address: "3000 ASH AVE.",
      p_city: "PEWEE VALLEY",
      p_note: null,
      p_also: [],
    });
    expect(onDone.mock.calls[0][0].text).toMatch(/Geocode now/);
  });

  it("won't save an address that changes nothing", () => {
    render(<PlaceEditor place={PLACE} onDone={onDone} />);
    fireEvent.click(button("Save address"));
    expect(screen.getByTestId("editor-error").textContent).toMatch(/already has/);
    expect(savePlaceFix).not.toHaveBeenCalled();
  });

  it("places a pasted pin, and saves it for every place at the address when asked", async () => {
    render(<PlaceEditor place={PLACE} onDone={onDone} />);
    expect(button("Use this pin").disabled).toBe(true);
    fireEvent.change(field("Latitude, longitude"), { target: { value: "38.30833, -85.49152" } });
    expect(screen.getByTestId("pin-map").textContent).toBe("pasted 38.30833, -85.49152");
    fireEvent.click(screen.getByLabelText(/Apply my fix to the 1 other place/));
    fireEvent.click(button("Use this pin"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(savePlaceFix).toHaveBeenCalledWith(
      expect.objectContaining({
        p_action: "pin",
        p_lon: -85.49152,
        p_lat: 38.30833,
        p_also: ["oldham-112"],
      }),
    );
  });

  it("says what is wrong with a pasted pin, and warns about one outside the county", () => {
    render(<PlaceEditor place={PLACE} onDone={onDone} />);
    fireEvent.change(field("Latitude, longitude"), { target: { value: "-85.49, 38.30" } });
    expect(screen.getByRole("alert").textContent).toMatch(/not in Kentucky/);
    fireEvent.change(field("Latitude, longitude"), { target: { value: "37.0, -84.0" } });
    expect(screen.getByRole("status").textContent).toMatch(/outside this county/);
  });

  it("leaves a place off the map with its note", async () => {
    render(<PlaceEditor place={PLACE} onDone={onDone} />);
    fireEvent.change(field("Note (optional, for you)"), { target: { value: "food truck" } });
    fireEvent.click(button("Leave off map"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(savePlaceFix).toHaveBeenCalledWith(
      expect.objectContaining({ p_action: "hide", p_note: "food truck" }),
    );
  });

  it("shows an address fix's outcome, and undoes a fix", async () => {
    const fixed = {
      ...PLACE,
      bucket: "retry",
      fix_action: "address",
      fix_city: "PEWEE VALLEY",
      fix_status: "not_found",
      result_query: "3000 ASH AVE., PEWEE VALLEY, KY",
      source_city: "PEEWEE VALLEY",
    };
    render(<PlaceEditor place={fixed} onDone={onDone} />);
    expect(screen.getByTestId("fix-state").textContent).toMatch(
      /Still not found: Not found: place the pin by hand/,
    );
    expect(field("Town").value).toBe("PEWEE VALLEY");
    fireEvent.click(button("Undo fix"));
    await waitFor(() => expect(clearPlaceFix).toHaveBeenCalledWith("oldham-111"));
  });

  it("shows the database's refusal and lets the admin try again", async () => {
    savePlaceFix.mockRejectedValueOnce(new Error("Admins only"));
    render(<PlaceEditor place={PLACE} onDone={onDone} />);
    fireEvent.click(button("Skip"));
    expect(await screen.findByText("Admins only")).toBeTruthy();
    expect(button("Skip").disabled).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
  });
});
