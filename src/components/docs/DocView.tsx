import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/ui/Icons";
import { DOCS, hrefFor, type Doc } from "@/lib/docs";

/**
 * The in-app documentation page. Server component: the HTML was rendered from /docs/*.md at build time.
 * Left: the doc list and "On this page". Right: the article. Below 981 px the sidebar stacks above the article and the
 * table of contents folds into a <details>.
 */
export function DocView({ doc }: { doc: Doc }) {
  const i = DOCS.findIndex((d) => d.slug === doc.slug);
  const prev = DOCS[i - 1];
  const next = DOCS[i + 1];

  const toc = (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[13.5px]">
      {doc.toc.map((t) => (
        <li key={t.id} className={t.level === 3 ? "pl-3" : ""}>
          <a href={`#${t.id}`} className={`block rounded-md px-2 py-1 no-underline hover:bg-stone ${t.level === 3 ? "text-muted" : "font-medium text-ink"}`}>
            {t.text}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="wrap pb-10">
      <div className="page-title">
        <span className="eyebrow">Documentation</span>
        <h1>{doc.heading}</h1>
        <p>{doc.blurb}</p>
      </div>

      <div className="mt-9 grid gap-8 w981:grid-cols-[250px_minmax(0,1fr)] w981:gap-12">
        <aside className="min-w-0 w981:sticky w981:top-[92px] w981:max-h-[calc(100dvh-110px)] w981:self-start w981:overflow-y-auto" aria-label="Documentation navigation">
          <nav aria-label="Documents">
            <p className="mono m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Docs</p>
            <ul className="m-0 flex list-none gap-1.5 overflow-x-auto p-0 pb-1 w981:flex-col w981:gap-0.5 w981:overflow-visible">
              {DOCS.map((d) => {
                const on = d.slug === doc.slug;
                return (
                  <li key={d.slug} className="shrink-0">
                    <Link
                      href={hrefFor(d.slug)}
                      aria-current={on ? "page" : undefined}
                      className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold no-underline w981:whitespace-normal ${on ? "bg-ink text-paper" : "text-ink hover:bg-stone"}`}
                    >
                      {d.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {doc.toc.length > 0 && (
            <>
              {/* desktop: always open */}
              <div className="mt-7 hidden w981:block">
                <p className="mono m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">On this page</p>
                <nav aria-label="On this page">{toc}</nav>
              </div>
              {/* mobile: folded */}
              <details className="mt-4 rounded-lg border border-line bg-surface px-3 py-2 w981:hidden">
                <summary className="cursor-pointer text-sm font-semibold">On this page</summary>
                <nav aria-label="On this page (mobile)" className="mt-2">{toc}</nav>
              </details>
            </>
          )}
        </aside>

        <div className="min-w-0">
          {/* Trusted: rendered at build time from this repository's own /docs markdown (lib/docs.ts), never from user input. */}
          <article className="prose-deed" data-testid="doc-article" dangerouslySetInnerHTML={{ __html: doc.html }} />

          <nav aria-label="Previous and next" className="mt-12 grid gap-3 border-t border-line pt-6 w640:grid-cols-2">
            {prev ? (
              <Link href={hrefFor(prev.slug)} className="group rounded-xl border border-line bg-surface p-4 no-underline hover:border-ink">
                <span className="mono flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-muted"><ArrowLeftIcon size={13} /> Previous</span>
                <b className="display mt-1 block text-lg font-semibold">{prev.title}</b>
              </Link>
            ) : <span />}
            {next && (
              <Link href={hrefFor(next.slug)} className="group rounded-xl border border-line bg-surface p-4 text-right no-underline hover:border-ink">
                <span className="mono flex items-center justify-end gap-1.5 text-[11px] uppercase tracking-[0.1em] text-muted">Next <ArrowRightIcon size={13} /></span>
                <b className="display mt-1 block text-lg font-semibold">{next.title}</b>
              </Link>
            )}
          </nav>
          <p className="muted mt-6 text-xs">
            Source: <code className="mono">docs/{doc.file}</code>. Edit the file and this page updates on the next build.
          </p>
        </div>
      </div>
    </div>
  );
}
