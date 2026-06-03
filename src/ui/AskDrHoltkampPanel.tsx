import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction
} from "react";
import { appliedFieldsFromResponse, applyAssistantPatch } from "../assistant/apply";
import { callMemoAssistant } from "../assistant/client";
import type { AssistantMessage } from "../assistant/schema";
import type { MemoSpec } from "../model/memoSpec";
import type { ValidationResult } from "../validation/validate";

function createMessage(
  role: AssistantMessage["role"],
  text: string,
  update: Partial<AssistantMessage> = {}
): AssistantMessage {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    ...update
  };
}

function AssistantMessageCard({ message }: { message: AssistantMessage }) {
  return (
    <article className={`ask-message ${message.role}`}>
      <strong>{message.role === "user" ? "You" : "Dr. Holtkamp"}</strong>
      <p>{message.text}</p>
      {message.appliedFields && message.appliedFields.length > 0 && (
        <div className="ask-chip-row" aria-label="Applied memo fields">
          {message.appliedFields.map((field) => (
            <span className="ask-chip" key={field}>
              {field}
            </span>
          ))}
        </div>
      )}
      {message.warnings && message.warnings.length > 0 && (
        <ul className="ask-note-list">
          {message.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {message.questions && message.questions.length > 0 && (
        <ul className="ask-note-list questions">
          {message.questions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function AskDrHoltkampPanel({
  canUndo,
  isOpen,
  messages,
  onApplySpec,
  onClose,
  onMessagesChange,
  onUndo,
  spec,
  validation
}: {
  canUndo: boolean;
  isOpen: boolean;
  messages: AssistantMessage[];
  onApplySpec: (nextSpec: MemoSpec, fields: string[]) => void;
  onClose: () => void;
  onMessagesChange: Dispatch<SetStateAction<AssistantMessage[]>>;
  onUndo: () => void;
  spec: MemoSpec;
  validation: ValidationResult;
}) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const specRef = useRef(spec);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    specRef.current = spec;
  }, [spec]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const seedPrompt = (prompt: string) => {
    setInput(prompt);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const instruction = input.trim();
    if (!instruction || isSending) return;

    const userMessage = createMessage("user", instruction);
    const nextMessages = [...messages, userMessage];
    onMessagesChange(nextMessages);
    setInput("");
    setIsSending(true);

    try {
      const response = await callMemoAssistant({
        instruction,
        messages: nextMessages,
        spec: specRef.current,
        validationItems: validation.items
      });
      const appliedFields =
        response.action === "applyPatch" && response.memoPatch
          ? appliedFieldsFromResponse(response)
          : [];

      if (response.action === "applyPatch" && response.memoPatch) {
        onApplySpec(applyAssistantPatch(specRef.current, response.memoPatch), appliedFields);
      }

      onMessagesChange((current) => [
        ...current,
        createMessage("assistant", response.assistantMessage, {
          appliedFields,
          warnings: response.warnings,
          questions: response.questions
        })
      ]);
    } catch (error) {
      onMessagesChange((current) => [
        ...current,
        createMessage(
          "assistant",
          error instanceof Error
            ? `I could not apply that yet: ${error.message}`
            : "I could not apply that yet. Check the network connection and try again."
        )
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside
      aria-label="Ask Dr. Holtkamp memo assistant"
      className={`ask-panel ${isOpen ? "open" : ""}`}
      hidden={!isOpen}
    >
      <div className="ask-panel-heading">
        <div>
          <p className="section-kicker">Gemini memo assist</p>
          <h2>Ask Dr. Holtkamp</h2>
        </div>
        <button className="secondary-button" onClick={onClose} type="button">
          Close
        </button>
      </div>
      <p className="ask-privacy-note">
        Uses the shared Bandaid6 Gemini Worker with ArmyMemo-only instructions. Do not enter
        classified information, PHI, or sensitive personal data.
      </p>
      <div className="ask-quick-actions" aria-label="Assistant shortcuts">
        <button
          aria-label="Paste old memo"
          className="ask-shortcut-card"
          onClick={() => seedPrompt("Convert this pasted text into an Army memorandum draft:\n\n")}
          type="button"
        >
          <strong>Paste old memo</strong>
          <span>Convert existing text</span>
        </button>
        <button
          aria-label="Write a memo"
          className="ask-shortcut-card"
          onClick={() => seedPrompt("Write a memorandum for this request:\n\n")}
          type="button"
        >
          <strong>Write a memo</strong>
          <span>Start from instructions</span>
        </button>
        <button
          aria-label="Improve current memo"
          className="ask-shortcut-card"
          onClick={() =>
            seedPrompt("Improve the current memo for clarity and AR 25-50 structure. Keep facts unchanged.")
          }
          type="button"
        >
          <strong>Improve current memo</strong>
          <span>Revise what is open</span>
        </button>
      </div>
      <div className="ask-history" aria-live="polite">
        {messages.length === 0 ? (
          <article className="ask-message assistant">
            <strong>Dr. Holtkamp</strong>
            <p>
              Give me rough text, an old memo, or the mission you need written up. I will fill the
              visible ArmyMemo fields and show what changed.
            </p>
          </article>
        ) : (
          messages.map((message) => <AssistantMessageCard key={message.id} message={message} />)
        )}
      </div>
      <form className="ask-compose" onSubmit={handleSubmit}>
        <label className="field-group">
          <span className="field-label">Message Dr. Holtkamp</span>
          <textarea
            disabled={isSending}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste text or ask for the memo you need..."
            ref={inputRef}
            rows={5}
            value={input}
          />
        </label>
        <div className="ask-compose-actions">
          <button className="primary-button" disabled={!input.trim() || isSending} type="submit">
            {isSending ? "Thinking..." : "Send to Dr. Holtkamp"}
          </button>
          <button
            className="secondary-button"
            disabled={!canUndo}
            onClick={onUndo}
            type="button"
          >
            Undo AI changes
          </button>
          <button
            className="text-button"
            disabled={messages.length === 0}
            onClick={() => onMessagesChange([])}
            type="button"
          >
            Clear chat
          </button>
        </div>
      </form>
    </aside>
  );
}
