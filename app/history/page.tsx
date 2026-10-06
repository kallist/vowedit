"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/frontend/api";
import { assetUrl, sourceBadge, type Run } from "@/frontend/types";
export default function History() {
  const [runs, setRuns] = useState<Run[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<Run[]>("/runs")
      .then(setRuns)
      .catch(() => setError("Could not load local history. Check the API."));
  }, []);
  return (
    <main className="studio-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">YOUR LOCAL STUDIO</p>
          <h1>Every edit has a story.</h1>
          <p className="muted">
            Your latest 50 edits. Images and receipts stay on this machine.
          </p>
        </div>
        <Link className="button primary" href="/edit/new">
          New edit →
        </Link>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {runs === null && !error && <p>Loading edits…</p>}
      {runs?.length === 0 && (
        <div className="empty-state">
          <h2>A fresh canvas.</h2>
          <p>Your edits will appear here once you generate.</p>
        </div>
      )}
      <div className="history-grid">
        {runs?.map((run) => (
          <Link href={`/edit/${run.id}`} key={run.id} className="history-item">
            <img src={assetUrl(run.source_image)} alt="Source of saved edit" />
            <div>
              <span className="eyebrow">
                {sourceBadge(run)} / {run.status.replaceAll("_", " ")}
              </span>
              <h2>{run.contract.change.instruction}</h2>
              <span className="caption">
                {new Date(run.created_at).toLocaleString()}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
