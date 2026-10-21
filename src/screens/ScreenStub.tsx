/** Stands in for a screen that has not been built yet. The screens test fails while any stub is left. */
export default function ScreenStub({ id }: { id: string }) {
  return (
    <main style={{ padding: 32 }}>
      <h1 className="e-h1">{id}</h1>
      <p className="e-meta">This screen is not built yet.</p>
    </main>
  );
}
