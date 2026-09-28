import Link from "next/link";
import { ArrowRight, Scan, ShieldCheck, ScanLine } from "lucide-react";
export default function Landing() {
  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-square" /> A LITTLE MORE INTENTION. A LOT LESS
            DRIFT.
          </p>
          <h1>
            Change what
            <br />
            you ask.
            <br />
            <em>
              Keep what
              <br />
              you don’t.
            </em>
          </h1>
          <p className="hero-description">
            An edit should change your image.
            <br />
            Not your intention.
          </p>
          <p className="muted">
            Tell AI what to change and what to leave alone.
            <br />
            Then see how well it kept its promise.
          </p>
          <Link className="button primary hero-cta" href="/edit/new">
            Try VowEdit <ArrowRight size={18} aria-hidden />
          </Link>
          <span className="caption">
            LOCAL STUDIO · MOCK DEMO INCLUDED · NO ACCOUNT
          </span>
        </div>
        <div className="hero-art">
          <div className="art-heading">
            <span>01 / THE EDIT CONTRACT</span>
            <span className="pill">Illustrative fixture</span>
          </div>
          <div className="art-image">
            <img
              src="/fixtures/illustration.svg"
              alt="Original geometric illustration of a person in a terracotta jacket"
            />
            <div className="keep-callout">
              <ShieldCheck size={15} aria-hidden /> KEEP / face & hair
            </div>
            <div className="change-callout">
              <Scan size={15} aria-hidden /> CHANGE / jacket
            </div>
            <div className="art-corner top-left" />
            <div className="art-corner bottom-right" />
          </div>
          <div className="art-bottom">
            <div>
              <span className="eyebrow">THE REQUEST</span>
              <p>“Change the jacket. Keep the character.”</p>
            </div>
            <ArrowUp />
          </div>
          <div className="floating-note">
            <ScanLine aria-hidden size={19} />
            <div>
              Every edit leaves a trace.
              <span>Ghost View makes it visible.</span>
            </div>
          </div>
        </div>
      </section>
      <section className="story-strip">
        <p className="eyebrow">
          A BETTER QUESTION THAN
          <br />
          “DOES IT LOOK GOOD?”
        </p>
        <h2>
          Did it change
          <br />
          <em>only what you asked?</em>
        </h2>
        <p>
          Make your boundaries visible. Compare three candidates. Inspect
          accidental changes. Leave with an Edit Receipt, not just another
          image.
        </p>
      </section>
      <section className="steps">
        <article>
          <span>01 / DEFINE</span>
          <h3>
            Two intentions.
            <br />
            One clear contract.
          </h3>
          <p>
            Brush over what may change. Protect what matters. Review the
            contract before you generate.
          </p>
        </article>
        <article>
          <span>02 / INSPECT</span>
          <h3>
            Good edits.
            <br />
            Visible mistakes.
          </h3>
          <p>
            See all three candidates. Ghost View reveals drift outside the area
            you asked to edit.
          </p>
        </article>
        <article>
          <span>03 / UNDERSTAND</span>
          <h3>
            A result.
            <br />
            And its receipt.
          </h3>
          <p>
            Transparent pixel metrics, explicit warnings, and a place for your
            judgment. No invented accuracy.
          </p>
        </article>
      </section>
    </main>
  );
}
function ArrowUp() {
  return <ArrowRight size={28} strokeWidth={1} aria-hidden />;
}
