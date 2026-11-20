// Versioned prompt templates live in config/prompts/<name>@v<n>.md with "## system" and "## user" sections.
// The sha256 is recorded in prompt_versions so every run can name the exact prompt it used.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "config", "prompts");

export type PromptTemplate = { name: string; version: number; system: string; user: string; template: string; sha256: string };

export function loadPrompt(name: string, version: number): PromptTemplate {
  const template = readFileSync(join(DIR, `${name}@v${version}.md`), "utf8");
  const system = template.split(/^## system\s*$/m)[1]?.split(/^## user\s*$/m)[0]?.trim();
  const user = template.split(/^## user\s*$/m)[1]?.trim();
  if (!system || !user) throw new Error(`Prompt ${name}@v${version} needs "## system" and "## user" sections`);
  return { name, version, system, user, template, sha256: createHash("sha256").update(template).digest("hex") };
}

export function listPrompts(): { name: string; version: number }[] {
  return readdirSync(DIR)
    .map((f) => f.match(/^(.+)@v(\d+)\.md$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ name: m[1], version: Number(m[2]) }));
}

export function render(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`Missing prompt variable {{${k}}}`);
    return vars[k];
  });
}
