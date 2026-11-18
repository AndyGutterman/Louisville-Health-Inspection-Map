// @vitest-environment jsdom
// The offer to get the weekly email in the site's language: shown once, after a language
// switch, to a signed-in subscriber whose email is in another language, and to nobody else.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DigestLanguageOffer from "./DigestLanguageOffer.jsx";
import { I18nProvider, useT } from "./I18nContext.jsx";
import { fetchDigestChoice, fetchDigestLanguage, saveDigestLanguage } from "./api/account.js";

let signedIn = true;
vi.mock("./AuthContext.jsx", () => ({
  useAuth: () => ({ user: signedIn ? { id: "u1" } : null }),
}));
vi.mock("./api/account.js", () => ({
  fetchDigestChoice: vi.fn(),
  fetchDigestLanguage: vi.fn(),
  saveDigestLanguage: vi.fn(),
}));

const Switcher = () => {
  const { setLang } = useT();
  return <button onClick={() => setLang("es")}>to-es</button>;
};
const setup = () =>
  render(
    <I18nProvider>
      <Switcher />
      <DigestLanguageOffer />
    </I18nProvider>,
  );
const profile = (frequency, language) => {
  fetchDigestChoice.mockResolvedValue({ data: { alert_frequency: frequency }, error: null });
  fetchDigestLanguage.mockResolvedValue({ data: { language }, error: null });
};

beforeEach(() => {
  signedIn = true;
  localStorage.clear();
  vi.clearAllMocks();
  saveDigestLanguage.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("DigestLanguageOffer", () => {
  it("reads nothing until the language is switched", () => {
    profile("weekly", "en");
    setup();
    expect(fetchDigestChoice).not.toHaveBeenCalled();
    expect(screen.queryByTestId("digest-language-offer")).toBeNull();
  });

  it("offers it to a subscriber whose email is in the other language, and saves a yes", async () => {
    profile("weekly", "en");
    setup();
    fireEvent.click(screen.getByText("to-es"));
    expect(await screen.findByTestId("digest-language-offer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sí" }));
    await waitFor(() => expect(saveDigestLanguage).toHaveBeenCalledWith("u1", "es"));
    await waitFor(() => expect(screen.queryByTestId("digest-language-offer")).toBeNull());
  });

  it("asks once: a no is remembered for that language", async () => {
    profile("weekly", "en");
    const first = setup();
    fireEvent.click(screen.getByText("to-es"));
    fireEvent.click(await screen.findByRole("button", { name: "No, gracias" }));
    expect(localStorage.getItem("lfs_digest_lang_offered")).toBe("es");
    first.unmount();
    setup();
    fireEvent.click(screen.getByText("to-es"));
    await waitFor(() => expect(fetchDigestLanguage).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("digest-language-offer")).toBeNull();
  });

  it("shows nothing to someone not subscribed, already in that language, or signed out", async () => {
    profile("off", "en");
    setup();
    fireEvent.click(screen.getByText("to-es"));
    await waitFor(() => expect(fetchDigestLanguage).toHaveBeenCalled());
    expect(screen.queryByTestId("digest-language-offer")).toBeNull();
    cleanup();

    profile("weekly", "es");
    setup();
    fireEvent.click(screen.getByText("to-es"));
    await waitFor(() => expect(fetchDigestLanguage).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("digest-language-offer")).toBeNull();
    cleanup();

    signedIn = false;
    setup();
    fireEvent.click(screen.getByText("to-es"));
    expect(fetchDigestLanguage).toHaveBeenCalledTimes(2);
  });

  it("says nothing when the database has no language column yet", async () => {
    fetchDigestChoice.mockResolvedValue({ data: { alert_frequency: "weekly" }, error: null });
    fetchDigestLanguage.mockResolvedValue({ data: null, error: { message: "no column" } });
    setup();
    fireEvent.click(screen.getByText("to-es"));
    await waitFor(() => expect(fetchDigestLanguage).toHaveBeenCalled());
    expect(screen.queryByTestId("digest-language-offer")).toBeNull();
  });
});
