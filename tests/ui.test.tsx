import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { createDefaultSpec, formatMemoDate } from "../src/model/defaultSpec";
import { DRAFT_STORAGE_KEY, saveActiveDraft } from "../src/model/drafts";

function mockAssistantResponse(payload: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }]
      }),
      { headers: { "Content-Type": "application/json" } }
    )
  );
  vi.stubGlobal(
    "fetch",
    fetchMock
  );
  return fetchMock;
}

describe("ArmyMemo editor", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("starts blocked and loads a valid synthetic example", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("button", { name: "Generate .docx" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Load example" }));
    expect(screen.getByRole("button", { name: "Generate .docx" })).toBeEnabled();
  });

  it("marks the AI pill with three stars while keeping a clear accessible label", () => {
    render(<App />);
    const askButton = screen.getByRole("button", { name: "Ask Dr. Holtkamp memo assistant" });
    expect(askButton).toHaveTextContent("✦✦✦");
    expect(askButton).toHaveTextContent("Ask Dr. Holtkamp");
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

  it("keeps the letterhead selector limited to DHA and Army with DHA as the default", async () => {
    const user = userEvent.setup();
    render(<App />);
    const selector = screen.getByLabelText("Letterhead") as HTMLSelectElement;

    expect(Array.from(selector.options, (option) => option.textContent)).toEqual([
      "DHA",
      "Army"
    ]);
    expect(selector).toHaveValue("glwch-dha");
    expect(screen.getByText("DEFENSE HEALTH AGENCY")).toBeInTheDocument();
    expect(screen.getByAltText("Authorized letterhead seal")).toHaveAttribute(
      "src",
      expect.stringContaining("assets/seals/army-seal.png")
    );
    expect(screen.queryByText("Generic Army unit")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New custom" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import profile" })).not.toBeInTheDocument();
    expect(screen.queryByText("Upload seal")).not.toBeInTheDocument();

    await user.selectOptions(selector, "glwch-army");

    expect(selector).toHaveValue("glwch-army");
    expect(screen.getByText("DEPARTMENT OF THE ARMY")).toBeInTheDocument();
    expect(screen.getByAltText("Authorized letterhead seal")).toHaveAttribute(
      "src",
      expect.stringContaining("assets/seals/army-seal.png")
    );
  });

  it("refreshes a restored built-in letterhead snapshot", () => {
    const staleSpec = createDefaultSpec();
    staleSpec.profileId = "glwach-dccs";
    staleSpec.letterhead = {
      ...staleSpec.letterhead,
      sealAssetPath: "assets/seals/placeholder.svg"
    };
    staleSpec.officeSymbol = "MCXP-DCCS";
    saveActiveDraft(staleSpec, []);
    render(<App />);
    expect(screen.getByAltText("Authorized letterhead seal")).toHaveAttribute(
      "src",
      expect.stringContaining("assets/seals/army-seal.png")
    );
    expect(screen.getByLabelText("Letterhead")).toHaveValue("glwch-dha");
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

  it("opens Ask Dr. Holtkamp, applies structured memo updates, and undoes them", async () => {
    const user = userEvent.setup();
    mockAssistantResponse({
      assistantMessage: "I filled the memo draft from your rough request.",
      action: "applyPatch",
      memoPatch: {
        subject: "Training Schedule Update",
        addressees: ["All Section Leaders"],
        paragraphs: [
          {
            text: "Purpose.  This memorandum announces the updated training schedule.",
            children: []
          }
        ],
        signature: {
          name: "Jordan A. Rivera",
          rankBranch: "LTC, MC",
          title: ["Deputy Commander for Clinical Services"],
          civilian: false
        }
      },
      changedFields: [
        { field: "subject" },
        { field: "addressees" },
        { field: "body paragraphs" },
        { field: "signature block" }
      ],
      warnings: [],
      questions: []
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Ask Dr. Holtkamp memo assistant" }));
    expect(
      screen.getByRole("complementary", { name: "Ask Dr. Holtkamp memo assistant" })
    ).toBeInTheDocument();
    expect(document.querySelector(".modal-backdrop")).toBeNull();

    fireEvent.change(screen.getByLabelText("Message Dr. Holtkamp"), {
      target: { value: "Write a memo for a training schedule update." }
    });
    await user.click(screen.getByRole("button", { name: "Send to Dr. Holtkamp" }));

    await waitFor(() => expect(screen.getByLabelText("Subject")).toHaveValue("Training Schedule Update"));
    expect(screen.getByLabelText("Paragraph 1")).toHaveValue(
      "Purpose.  This memorandum announces the updated training schedule."
    );
    expect(screen.getByText("I filled the memo draft from your rough request.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo AI changes" }));
    expect(screen.getByLabelText("Subject")).toHaveValue("");
    expect(screen.getByLabelText("Paragraph 1")).toHaveValue("");
  });

  it("sends the assistant prompt with Enter and applies memo fields on the first response", async () => {
    const user = userEvent.setup();
    const fetchMock = mockAssistantResponse({
      assistantMessage: "I filled the memo draft from your pasted text.",
      action: "applyPatch",
      memoPatch: {
        subject: "Enter Key Training Update",
        paragraphs: [
          {
            text: "Purpose.  This memorandum confirms the Enter key workflow.",
            children: []
          }
        ]
      },
      changedFields: [{ field: "subject" }, { field: "body paragraphs" }],
      warnings: [],
      questions: []
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Ask Dr. Holtkamp memo assistant" }));
    await user.type(
      screen.getByLabelText("Message Dr. Holtkamp"),
      "Convert this pasted memo text into a draft."
    );
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(screen.getByLabelText("Subject")).toHaveValue("Enter Key Training Update")
    );
    expect(screen.getByLabelText("Paragraph 1")).toHaveValue(
      "Purpose.  This memorandum confirms the Enter key workflow."
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps Shift+Enter as a newline without sending the assistant prompt", async () => {
    const user = userEvent.setup();
    const fetchMock = mockAssistantResponse({
      assistantMessage: "This should not be sent.",
      action: "noChange",
      memoPatch: null,
      changedFields: [],
      warnings: [],
      questions: []
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Ask Dr. Holtkamp memo assistant" }));
    const messageInput = screen.getByLabelText("Message Dr. Holtkamp");
    await user.type(messageInput, "Line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(messageInput).toHaveValue("Line one\n");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recovers JSON-looking assistant chat into memo fields without showing raw code", async () => {
    const user = userEvent.setup();
    const nestedPatch = {
      subject: "Recovered Old Memo",
      paragraphs: [
        {
          text: "Purpose.  This memorandum was recovered from nested JSON.",
          children: []
        }
      ]
    };
    mockAssistantResponse({
      assistantMessage: `\`\`\`json\n${JSON.stringify(nestedPatch, null, 2)}\n\`\`\``,
      action: "noChange",
      memoPatch: null,
      changedFields: [],
      warnings: [],
      questions: []
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Ask Dr. Holtkamp memo assistant" }));
    await user.type(screen.getByLabelText("Message Dr. Holtkamp"), "Convert this old memo.");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(screen.getByLabelText("Subject")).toHaveValue("Recovered Old Memo")
    );
    expect(screen.getByLabelText("Paragraph 1")).toHaveValue(
      "Purpose.  This memorandum was recovered from nested JSON."
    );
    expect(
      screen.getByText("I updated the memo fields from the assistant response.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/```json/)).not.toBeInTheDocument();
  });

  it("keeps assistant chat while toggling the panel but does not persist it across remounts", async () => {
    const user = userEvent.setup();
    mockAssistantResponse({
      assistantMessage: "I need the signer before changing the memo.",
      action: "askClarifyingQuestion",
      memoPatch: null,
      changedFields: [],
      warnings: [],
      questions: ["Who signs this memorandum?"]
    });

    const { unmount } = render(<App />);
    await user.click(screen.getByRole("button", { name: "Ask Dr. Holtkamp memo assistant" }));
    fireEvent.change(screen.getByLabelText("Message Dr. Holtkamp"), {
      target: { value: "Draft a memo from scratch." }
    });
    await user.click(screen.getByRole("button", { name: "Send to Dr. Holtkamp" }));
    await screen.findByText("I need the signer before changing the memo.");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Ask Dr. Holtkamp memo assistant" }));
    expect(screen.getByText("Draft a memo from scratch.")).toBeInTheDocument();

    unmount();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Ask Dr. Holtkamp memo assistant" }));
    expect(screen.queryByText("Draft a memo from scratch.")).not.toBeInTheDocument();
    expect(screen.getByText(/Give me rough text/)).toBeInTheDocument();
  });

  it("makes assistant shortcut choices prominent while preserving their seed prompts", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Ask Dr. Holtkamp memo assistant" }));

    await user.click(screen.getByRole("button", { name: "Paste old memo" }));
    expect(screen.getByLabelText("Message Dr. Holtkamp")).toHaveValue(
      "Convert this pasted text into an Army memorandum draft:\n\n"
    );
    expect(screen.getByText("Convert existing text")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Write a memo" }));
    expect(screen.getByLabelText("Message Dr. Holtkamp")).toHaveValue(
      "Write a memorandum for this request:\n\n"
    );
    expect(screen.getByText("Start from instructions")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Improve current memo" }));
    expect(screen.getByLabelText("Message Dr. Holtkamp")).toHaveValue(
      "Improve the current memo for clarity and AR 25-50 structure. Keep facts unchanged."
    );
    expect(screen.getByText("Revise what is open")).toBeInTheDocument();
  });
});
