import Link from "next/link";

export default function NotFound() {
  return (
    <main className="center-screen corruption-2">
      <p className="ascii-art" aria-hidden="true">{`// root not found //\n   x   x   x`}</p>
      <h1>this furrow is empty</h1>
      <Link className="text-link" href="/patch">return to the patch</Link>
    </main>
  );
}
