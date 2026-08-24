export function CandidateBadge({ number, name }: { number: string; name: string }) {
  return (
    <div className="candidate-badge" aria-label={`受験者 ${number} ${name}`}>
      <span>受験番号</span>
      <strong>{number}</strong>
      <i />
      <strong>{name}</strong>
    </div>
  );
}
