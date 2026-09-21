import type { Page } from "playwright";
import TurndownService from "turndown";
import * as gfm from "turndown-plugin-gfm";
import type { RawElement } from "./lib.js";
const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
turndown.use(gfm.gfm);
export interface CaptureCaps {
  label: number;
  option: number;
  href: number;
}
// Non-credential defaults preserve the original extraction semantics exactly:
// labels capped at 80 (the noise-name threshold), hrefs and option labels
// uncapped in practice.
export const DEFAULT_CAPTURE_CAPS: CaptureCaps = { label: 80, option: 1_000_000, href: 1_000_000 };
export async function extractAndStamp(
  page: Page,
  bounded: (cap: number) => number,
  caps: CaptureCaps = DEFAULT_CAPTURE_CAPS,
  includePasswordInputs = false,
): Promise<RawElement[]> {
  return page.evaluate(
    ({ cap, includePw }: { cap: CaptureCaps; includePw: boolean }) => {
      // Clear stamps from previous steps first: elements that dropped out of
      // the candidate list keep their old data-jev-id, which would make
      // selectors match more than one element.
      document.querySelectorAll("[data-jev-id]").forEach((el) => el.removeAttribute("data-jev-id"));
      const SEL =
        'a[href], button, input, textarea, select, [role="button"], [role="link"], [role="searchbox"], [role="textbox"]';
      const out: any[] = [];
      for (const el of document.querySelectorAll(SEL) as NodeListOf<HTMLElement>) {
        // Cap accepted candidates AFTER filtering so hidden boilerplate at the
        // top of the DOM cannot crowd out usable controls below it.
        if (out.length >= 2000) break;
        const rects = el.getClientRects();
        if (!rects.length) continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const tag = el.tagName.toLowerCase();
        const roleAttr = el.getAttribute("role") || "";
        const typeAttr = (el.getAttribute("type") || "").toLowerCase();
        // Accessible-name resolution for form controls (AccName 1.2 §4.3.2):
        // aria-labelledby refs first, then aria-label, then the control's
        // associated native labels (label[for] and wrapping labels, all of
        // them, in tree order), then placeholder and title. Inputs are void
        // elements: innerText is always empty, so plain <label for> forms
        // resolve here or not at all. Every candidate is normalized before the
        // fallback chain so a blank attribute cannot suppress the rest of it.
        const norm = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();
        const labelledby = norm(
          (el.getAttribute("aria-labelledby") ?? "")
            .split(/\s+/)
            .map((ref) => document.getElementById(ref)?.textContent ?? "")
            .join(" "),
        );
        const nativeLabels = norm(
          Array.from((el as HTMLInputElement).labels ?? [])
            .map((l) => l.textContent ?? "")
            .join(" "),
        );
        // Search-like fields, by structure alone: input[type=search] or
        // role=searchbox. No form-membership or label-text heuristics here:
        // a plain text field that only looks like a search box is a real form
        // field and must keep type + submit, not a one-action search.
        const searchField = (tag === "input" && typeAttr === "search") || roleAttr === "searchbox";
        // Submit controls: an explicit submission affordance. A <button> with
        // no type attribute defaults to submit inside a form.
        const submitControl =
          (tag === "button" && (typeAttr === "submit" || (!el.hasAttribute("type") && el.closest("form") !== null))) ||
          (tag === "input" && typeAttr === "submit");
        // Submit button inputs carry their visible label in the value attribute
        // (HTML-AAM: after ARIA and native labels, before title); with no value
        // the browser supplies a default label, "Submit". Without this the
        // control extracts as unlabeled noise and drops out of the action space.
        // The UA-default label applies only when value is unspecified; an
        // explicit empty value stays empty and falls through to title.
        const valueAttr = el.getAttribute("value");
        const valueLabel =
          tag === "input" && typeAttr === "submit"
            ? valueAttr ?? "Submit"
            : tag === "input" && typeAttr === "button"
              ? valueAttr ?? ""
              : "";
        const label = norm(
          labelledby ||
            norm(el.getAttribute("aria-label")) ||
            nativeLabels ||
            norm(valueLabel) ||
            norm(el.getAttribute("placeholder")) ||
            norm(el.getAttribute("title")) ||
            norm(el.innerText) ||
            norm(el.textContent) ||
            "",
        );
        const href = tag === "a" ? (el.getAttribute("href") || "").slice(0, cap.href) : "";
        const clickable =
          ["a", "button"].includes(tag) ||
          ["button", "link"].includes(roleAttr) ||
          ["submit", "button", "checkbox", "radio"].includes(typeAttr);

        const selectable = tag === "select";
        // Password inputs are excluded from typeable by design, even when a
        // role attribute would otherwise make them typeable; they are stamped
        // separately so credential runs can offer fill_password. Without a
        // password source they are skipped entirely, before stamping: they
        // never consume the candidate budget on ordinary runs.
        const passwordInput = tag === "input" && typeAttr === "password";
        if (passwordInput && !includePw) continue;
        const typeable =
          !passwordInput &&
          (tag === "textarea" ||
            (tag === "input" && !["submit", "button", "checkbox", "radio", "file", "hidden", "range", "password"].includes(typeAttr)) ||
            ["searchbox", "textbox"].includes(roleAttr));
        // Enter submits from single-line fields (implicit form submission, or
        // the site's own Enter handler); a textarea Enter is just a newline.
        const enterSubmittable = typeable && tag !== "textarea";
        if (!clickable && !typeable && !selectable && !(passwordInput && includePw)) continue;
        const attr = `j${out.length + 1}`;
        el.setAttribute("data-jev-id", attr);
        const options =
          tag === "select"
            ? Array.from((el as unknown as HTMLSelectElement).options)
                // Keep each option's live DOM index alongside its label:
                // selection happens by index, so a scrubbed or truncated
                // label can never become the selection key.
                .map((o, i) => ({ i, label: (o.label || o.value || "").trim().slice(0, cap.option) }))
                .filter((o) => o.label.length > 0)
                .slice(0, 200)
            : undefined;
        out.push({ attr, tag, role: roleAttr || tag, text: label.slice(0, cap.label), href, typeAttr, clickable, typeable, searchField, submitControl, enterSubmittable, selectable, passwordInput: passwordInput || undefined, options });
      }
      return out;
    },
    { cap: caps, includePw: includePasswordInputs },
  );
}

export interface Observables {
  url: string;
  title: string;
  textLength: number;
  scrollY: number;
  excerpt: string;
}

export async function pageObservables(page: Page, bounded: (cap: number) => number, excerptCap = 1500): Promise<Observables> {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const data = await page
    .evaluate((cap: number) => ({
      length: document.body?.innerText?.length ?? 0,
      scrollY: window.scrollY,
      excerpt: (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, cap),
    }), excerptCap)
    .catch(() => ({ length: 0, scrollY: 0, excerpt: "" }));
  return { url, title, textLength: data.length, scrollY: data.scrollY, excerpt: data.excerpt };
}

export async function settle(page: Page, bounded: (cap: number) => number) {
  await page.waitForLoadState("domcontentloaded", { timeout: bounded(4_000) }).catch(() => {});
  // DOM-stability settle: two consecutive identical fingerprints mean the page
  // has stopped re-rendering, which is the signal we actually want; quiet
  // network was only ever a proxy for it, and analytics pings keep heavy sites
  // permanently noisy. Capped; a page that never settles still gets acted on.
  const deadline = performance.now() + bounded(1_500);
  let prev: string | null = null;
  while (performance.now() < deadline) {
    const fingerprint = await page
      .evaluate(
        () =>
          `${document.body?.innerText?.length ?? 0}:${document.querySelectorAll("a,button,input,select,textarea").length}`,
      )
      .catch(() => null);
    if (fingerprint !== null && fingerprint === prev) return; // DOM went quiet
    prev = fingerprint;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(400); // never settled; act anyway
}


export async function extractPayload(
  page: Page,
  format: string,
  maxChars: number,
  bounded: (cap: number) => number,
  redact: (s: string) => string = (s) => s,
): Promise<{ truncated: boolean; true_length: number; content: string }> {
  let content = "";
  if (format === "html") {
    // Strip the extraction stamps so returned HTML matches the page the user
    // would see, not the instrumented one.
    content = await page.evaluate(
      () => {
        const clone = document.documentElement.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("[data-jev-id]").forEach((el) => el.removeAttribute("data-jev-id"));
        return clone.outerHTML;
      });
  } else if (format === "aria") {
    content = await page.locator("body").ariaSnapshot({ timeout: bounded(10_000) });
  } else if (format === "markdown") {
    const html = await page.evaluate(() => document.body?.innerHTML ?? "");
    // Redact the source HTML before conversion: entity and attribute forms
    // of an echoed value exist in the DOM string, not the markdown output,
    // and turndown can mangle them past the redactor's patterns.
    content = turndown.turndown(redact(html));
  } else {
    content = await page.evaluate(() => document.body?.innerText ?? "");
  }
  content = redact(content);
  return {
    truncated: content.length > maxChars,
    true_length: content.length,
    content: content.slice(0, maxChars),
  };
}
