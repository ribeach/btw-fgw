// Page shell behaviour shared by all three pages.
//
// Right now that is the masthead spectrum bar: the one-line left / other / right
// tally that sits directly under the nav. Each page decides what the three
// numbers mean and supplies its own caption; this module only draws them.

import { BLOC_COLORS } from "./config.js";

/** Order the segments are painted in, left to right. */
const SEGMENTS = [
  { key: "left", label: "Left", color: BLOC_COLORS.left },
  { key: "other", label: "Other", color: BLOC_COLORS.neutral },
  { key: "right", label: "Right", color: BLOC_COLORS.right },
];

const fmt = (n) => n.toFixed(1);

/**
 * Render the masthead spectrum bar and its readout.
 *
 * The three values are normalised to 100, so callers can pass raw percentage
 * points that do not quite sum to 100 (rounding, "sonstige" spill) without the
 * bar under- or over-filling. Both nodes stay hidden until there is something
 * to show, so a page that never calls this shows no empty chrome.
 *
 * @param {HTMLElement|null} elBar      the `.spectrum` container
 * @param {HTMLElement|null} elReadout  the `.spectrum-readout` paragraph
 * @param {object} shares
 * @param {number} shares.left          left-bloc share
 * @param {number} shares.other         everything outside the two blocs
 * @param {number} shares.right         right-bloc share
 * @param {string} [shares.caption]     trailing context, e.g. "Latest projection, Aug 2026"
 * @returns {boolean} true when the bar was rendered
 */
export function renderSpectrum(elBar, elReadout, { left, other, right, caption = "" } = {}) {
  if (!elBar || !elReadout) return false;

  const raw = { left, other, right };
  const total = SEGMENTS.reduce((sum, s) => sum + (Number(raw[s.key]) || 0), 0);
  if (!(total > 0)) return false;

  const shares = SEGMENTS.map((s) => ({
    ...s,
    value: ((Number(raw[s.key]) || 0) / total) * 100,
  }));

  elBar.replaceChildren(
    ...shares.map((s) => {
      const seg = document.createElement("span");
      seg.className = "spectrum-seg";
      seg.style.flexBasis = `${s.value}%`;
      seg.style.background = s.color;
      return seg;
    })
  );

  elBar.setAttribute("role", "img");
  elBar.setAttribute(
    "aria-label",
    shares.map((s) => `${s.label} ${fmt(s.value)} percent`).join(", ") +
      (caption ? `. ${caption}` : "")
  );

  // The readout is the bar's caption in print, not a second reading of it: the
  // bar already carries the whole sentence in its aria-label, so announcing the
  // text again would say everything twice.
  elReadout.setAttribute("aria-hidden", "true");

  // textContent throughout: the caption may carry a data-derived date.
  elReadout.replaceChildren(
    document.createTextNode(shares.map((s) => `${s.label} ${fmt(s.value)}`).join(" · "))
  );
  if (caption) {
    const captionEl = document.createElement("span");
    captionEl.className = "spectrum-caption";
    captionEl.textContent = ` — ${caption}`;
    elReadout.appendChild(captionEl);
  }

  elBar.hidden = false;
  elReadout.hidden = false;
  return true;
}
