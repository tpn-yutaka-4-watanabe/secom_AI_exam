export function CandidateBadge({ number, name, numberLabel = "受験番号" }: { number: string; name: string; numberLabel?: string }) {
  return (
    <div className="candidate-badge" aria-label={`受験者 ${number} ${name}`}>
      <span>{numberLabel}</span>
      <strong>{number}</strong>
      <i />
      <strong>{name}</strong>
    </div>
  );
}
