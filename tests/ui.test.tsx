import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../src/App";
import { createDefaultSpec, formatMemoDate } from "../src/model/defaultSpec";
import { DRAFT_STORAGE_KEY, saveActiveDraft } from "../src/model/drafts";

describe("ArmyMemo editor", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts blocked and loads a valid synthetic example", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("button", { name: "Generate .docx" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Load example" }));
    expect(screen.getByRole("button", { name: "Generate .docx" })).toBeEnabled();
  });

  it("starts new memos with today's editable local date", async () => {
    const user = userEvent.setup();
    render(<App />);
    const dateInput = screen.getByLabelText("Date");
    expect(dateInput).toHaveValue(formatMemoDate());
    await user.clear(dateInput);
    await user.type(dateInput, "2 June 2026");
    expect(dateInput).toHaveValue("2 June 2026");
    await user.click(screen.getByRole("button", { name: "New memo" }));
    expect(dateInput).toHaveValue(formatMemoDate());
  });

  it("guides users through stages without locking direct navigation", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("button", { name: "1. Setup: Current step" })).toHaveAttribute(
      "aria-current",
      "step"
    );
    await user.click(screen.getByRole("button", { name: "Continue to body" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "2. Body: Current step" })).toHaveAttribute(
        "aria-current",
        "step"
      )
    );
    expect(document.activeElement).toHaveAttribute("id", "body-stage");
    await user.click(screen.getByRole("button", { name: "Continue to closing" }));
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("id", "closing-stage")
    );
    await user.click(screen.getByRole("button", { name: "Review memo" }));
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("id", "review-stage")
    );
  });

  it("focuses the related field from an actionable compliance issue", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Subject required/ }));
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("id", "memo-subject")
    );
  });

  it("keeps passed checks and advanced options collapsed by default", () => {
    render(<App />);
    expect(screen.getByText(/Passed checks/).closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Advanced options").closest("details")).not.toHaveAttribute("open");
  });

  it("shows the selected profile seal in the structural preview", () => {
    render(<App />);
    expect(screen.getByAltText("Authorized letterhead seal")).toBeInTheDocument();
  });

  it("refreshes a restored built-in letterhead snapshot", () => {
    const staleSpec = createDefaultSpec();
    staleSpec.letterhead = {
      ...staleSpec.letterhead,
      sealAssetPath: "assets/seals/placeholder.svg"
    };
    staleSpec.officeSymbol = "MCXP-DCCS";
    saveActiveDraft(staleSpec, []);
    render(<App />);
    expect(screen.getByAltText("Authorized letterhead seal")).toHaveAttribute(
      "src",
      expect.stringContaining("assets/seals/dod-seal.png")
    );
    expect(screen.getByLabelText("Office symbol")).toHaveValue("MCXP-CCS");
  });

  it("preserves an edited office symbol when refreshing built-in defaults", () => {
    const savedSpec = createDefaultSpec();
    savedSpec.officeSymbol = "MCXP-CUSTOM";
    saveActiveDraft(savedSpec, []);
    render(<App />);
    expect(screen.getByLabelText("Office symbol")).toHaveValue("MCXP-CUSTOM");
  });

  it("expands the preview and restores focus after Escape", async () => {
    const user = userEvent.setup();
    render(<App />);
    const expandButton = screen.getByRole("button", { name: "Expand preview" });
    await user.click(expandButton);
    expect(screen.getByRole("dialog", { name: "Expanded preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close preview" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Expanded preview" })).not.toBeInTheDocument();
    expect(expandButton).toHaveFocus();
  });

  it("keeps generation enabled when a valid memo omits the optional ARIMS record number", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Load example" }));
    await user.clear(screen.getByLabelText("ARIMS record number Optional"));
    expect(screen.getByRole("button", { name: "Generate .docx" })).toBeEnabled();
    expect(screen.getByText("ARIMS record number not entered")).toBeInTheDocument();
  });

  it("hides the deferred paste-text workflow", () => {
    render(<App />);
    expect(screen.queryByRole("tab", { name: "Paste text" })).not.toBeInTheDocument();
    expect(screen.queryByText("Convert to blocks")).not.toBeInTheDocument();
  });

  it("automatically labels added paragraphs and subparagraphs", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const labels = () =>
      Array.from(container.querySelectorAll(".block-number"), (label) => label.textContent);

    expect(labels()).toEqual(["1."]);
    await user.click(screen.getAllByRole("button", { name: "Add paragraph" })[0]);
    expect(labels()).toEqual(["1.", "2."]);
    await user.click(screen.getAllByRole("button", { name: "Add subparagraph" })[0]);
    expect(labels()).toEqual(["1.", "a.", "2."]);
    await user.click(screen.getAllByRole("button", { name: "Add paragraph" })[1]);
    expect(labels()).toEqual(["1.", "a.", "b.", "2."]);
  });

  it("previews and applies sentence-spacing corrections", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Load example" }));
    const firstParagraph = screen.getByLabelText("Paragraph 1");
    fireEvent.change(firstParagraph, { target: { value: "Purpose. This needs correction." } });
    await user.click(screen.getByRole("button", { name: "Fix sentence spacing" }));
    expect(screen.getByText(/Preview ready/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply corrections" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Paragraph 1")).toHaveValue(
        "Purpose.  This needs correction."
      )
    );
  });

  it("autosaves the active draft in localStorage", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Load example" }));
    await waitFor(() => expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull(), {
      timeout: 1000
    });
  });
});
