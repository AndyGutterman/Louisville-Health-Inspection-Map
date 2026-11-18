// @vitest-environment jsdom
// What's New as a component: which list it asks for and when, the rows it shows, and what
// a click on a row passes on, including a row with no map location.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import WhatsNew from "./WhatsNew.jsx";
import { fetchWhatsNewList } from "./api/whatsNew.js";

vi.mock("./api/whatsNew.js", () => ({ fetchWhatsNewList: vi.fn() }));

const PINNED = {
  establishment_id: "100002",
  premise_name: "Pinned Diner",
  address: "500 W Main St",
  inspection_date: "2026-11-10",
  score: 82,
  violation_count: 2,
};
const NO_PIN = {
  establishment_id: "100099",
  premise_name: "Nowhere Cafe",
  address: null,
  inspection_date: "2026-11-09",
  score: 95,
  violation_count: 0,
};
const BULLITT = {
  establishment_id: "bullitt-12",
  premise_name: "Bullitt Grill",
  address: "1 Main St",
  inspection_date: "2026-11-08",
  score: 90,
  violation_count: 1,
  region: "bullitt",
};
const LISTS = {
  get_latest_inspections: [PINNED, NO_PIN, BULLITT],
  get_whats_new: [PINNED],
  get_top_scores: [NO_PIN],
};

beforeEach(() => {
  fetchWhatsNewList.mockImplementation((rpc) =>
    Promise.resolve({ data: LISTS[rpc] ?? [], error: null }),
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const row = (name) => screen.findByText(name).then((el) => el.closest(".wn-card"));
const openPanel = (props = {}) =>
  render(<WhatsNew open counties={["jefferson", "bullitt"]} {...props} />);

describe("WhatsNew", () => {
  it("closed: only its button, and nothing is read", () => {
    const onOpen = vi.fn();
    render(<WhatsNew open={false} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "What's New" }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(fetchWhatsNewList).not.toHaveBeenCalled();
  });

  it("opens on Latest and reads only that list", async () => {
    openPanel();
    expect(await screen.findByText("Pinned Diner")).toBeTruthy();
    expect(fetchWhatsNewList).toHaveBeenCalledTimes(1);
    expect(fetchWhatsNewList).toHaveBeenCalledWith("get_latest_inspections");
  });

  it("reads each tab once: switching back costs nothing", async () => {
    openPanel();
    await screen.findByText("Pinned Diner");
    fireEvent.click(screen.getByRole("button", { name: "Top Scores" }));
    await screen.findByText("Nowhere Cafe");
    fireEvent.click(screen.getByRole("button", { name: "Latest" }));
    await screen.findByText("Pinned Diner");
    expect(fetchWhatsNewList.mock.calls.map(([rpc]) => rpc)).toEqual([
      "get_latest_inspections",
      "get_top_scores",
    ]);
  });

  it("a row with no map location says so, and still opens the place", async () => {
    const onOpenEstablishment = vi.fn();
    openPanel({ onOpenEstablishment });
    const card = await row("Nowhere Cafe");
    expect(card.textContent).toContain("Location unavailable");
    fireEvent.click(card);
    expect(onOpenEstablishment).toHaveBeenCalledWith("100099", NO_PIN);
  });

  it("a row with a pin passes its id and row, and reports hovering", async () => {
    const onOpenEstablishment = vi.fn();
    const onHoverEstablishment = vi.fn();
    const onHoverEstablishmentEnd = vi.fn();
    openPanel({ onOpenEstablishment, onHoverEstablishment, onHoverEstablishmentEnd });
    const card = await row("Pinned Diner");
    expect(card.textContent).toContain("2 violations");
    fireEvent.mouseEnter(card);
    fireEvent.mouseLeave(card);
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onHoverEstablishment).toHaveBeenCalledWith("100002");
    expect(onHoverEstablishmentEnd).toHaveBeenCalledOnce();
    expect(onOpenEstablishment).toHaveBeenCalledWith("100002", PINNED);
  });

  it("leaves out counties that are switched off, without reading again", async () => {
    const { rerender } = openPanel();
    expect(await screen.findByText("Bullitt Grill")).toBeTruthy();
    rerender(<WhatsNew open counties={["jefferson"]} />);
    expect(screen.queryByText("Bullitt Grill")).toBeNull();
    expect(screen.getByText("Pinned Diner")).toBeTruthy();
    expect(fetchWhatsNewList).toHaveBeenCalledTimes(1);
  });

  it("says so when a list can't be read", async () => {
    fetchWhatsNewList.mockResolvedValue({ data: null, error: { message: "boom" } });
    openPanel();
    expect(await screen.findByText("Could not load.")).toBeTruthy();
  });

  it("Close calls onClose", async () => {
    const onClose = vi.fn();
    openPanel({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "Close What's New" }));
    expect(onClose).toHaveBeenCalledOnce();
    await screen.findByText("Pinned Diner"); // let the read finish inside the test
  });
});
