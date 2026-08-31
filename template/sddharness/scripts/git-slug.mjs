/**
 * git-slug.mjs — slug estável para nomes de branch/worktree.
 */

import { pathToFileURL } from "node:url";

const MAX_LEN = 48;

const ACCENTS = {
  á: "a",
  à: "a",
  ã: "a",
  â: "a",
  ä: "a",
  é: "e",
  ê: "e",
  è: "e",
  ë: "e",
  í: "i",
  ì: "i",
  î: "i",
  ï: "i",
  ó: "o",
  ô: "o",
  õ: "o",
  ò: "o",
  ö: "o",
  ú: "u",
  ù: "u",
  û: "u",
  ü: "u",
  ç: "c",
  ñ: "n",
};

export function slugify(input, maxLen = MAX_LEN) {
  let s = String(input ?? "").trim();
  s = s.replace(/./g, (ch) => ACCENTS[ch] ?? ACCENTS[ch.toLowerCase()] ?? ch);
  s = s.normalize("NFKD").replace(/\p{M}/gu, "");
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  s = s.replace(/-+/g, "-");
  if (s.length > maxLen) {
    s = s.slice(0, maxLen).replace(/-+$/g, "");
  }
  return s || "feature";
}

export function featureNn(featureName) {
  const m = String(featureName).match(/^feature-(\d+)$/i);
  if (!m) throw new Error(`nome de feature inválido: ${featureName}`);
  return m[1].padStart(2, "0");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv.slice(2).join(" ");
  if (!arg) {
    console.error("Usage: node git-slug.mjs <texto>");
    process.exit(1);
  }
  console.log(slugify(arg));
}
