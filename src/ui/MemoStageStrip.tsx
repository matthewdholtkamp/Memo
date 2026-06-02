import type { MemoStage, ValidationResult } from "../validation/validate";

const STAGES: Array<{ id: MemoStage; label: string }> = [
  { id: "setup", label: "Setup" },
  { id: "body", label: "Body" },
  { id: "closing", label: "Closing" },
  { id: "review", label: "Review & download" }
];

function stageStatus(
  stage: MemoStage,
  activeStage: MemoStage,
  validation: ValidationResult
): "current" | "complete" | "attention" {
  if (stage === activeStage) return "current";
  if (stage === "review") return validation.canGenerate ? "complete" : "attention";
  return validation.items.some(
    (item) => item.stage === stage && item.level !== "pass"
  )
    ? "attention"
    : "complete";
}

export function MemoStageStrip({
  activeStage,
  onSelect,
  validation
}: {
  activeStage: MemoStage;
  onSelect: (stage: MemoStage) => void;
  validation: ValidationResult;
}) {
  return (
    <nav aria-label="Memo progress" className="stage-strip">
      {STAGES.map((stage, index) => {
        const status = stageStatus(stage.id, activeStage, validation);
        const statusLabel =
          status === "current"
            ? "Current step"
            : status === "complete"
              ? "Complete"
              : "Needs attention";
        return (
          <button
            aria-label={`${index + 1}. ${stage.label}: ${statusLabel}`}
            aria-current={status === "current" ? "step" : undefined}
            className={`stage-button ${status}`}
            key={stage.id}
            onClick={() => onSelect(stage.id)}
            type="button"
          >
            <span className="stage-number">{index + 1}</span>
            <span>
              <strong>{stage.label}</strong>
              <small>{statusLabel}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
