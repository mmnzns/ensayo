import Link from "../ui/Link";

export default function NotFound({ id }: { id: string }) {
  return (
    <main style={{ padding: 32, display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 className="e-h1">There's no screen called "{id}"</h1>
      <Link to="2-1-home">Back to Home</Link>
    </main>
  );
}
