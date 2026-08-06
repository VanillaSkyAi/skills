import registryData from "./registry-data.mjs";

/** Exact bundled catalog used by validation and exposed to coding agents. */
export function templateCatalog({ id = null } = {}) {
  const templates = Object.entries(registryData.templates)
    .map(([templateId, template]) => ({ id: templateId, ...template }))
    .filter((template) => !id || template.id === id);

  return {
    templates,
    aliases: registryData.aliases,
    formats: Object.values(registryData.formats),
    backgroundEffects: registryData.backgroundEffects,
    stylePresets: registryData.stylePresets,
  };
}

const variableSummary = (schema) =>
  Object.entries(schema)
    .map(([name, field]) => `${name}:${field.type}${field.required ? "*" : ""}`)
    .join(", ");

/** CLI entry for `vanillasky templates [id] [--json]`. */
export function templatesCommand({ id = null, json = false, log = console.log, error = console.error } = {}) {
  const catalog = templateCatalog({ id });
  if (id && catalog.templates.length === 0) {
    const alias = registryData.aliases[id];
    error(
      `[vanillasky] unknown template "${id}".` +
      (alias ? ` Use the canonical id "${alias}".` : " Run `vanillasky templates` to list canonical ids."),
    );
    return 1;
  }

  if (json) {
    log(JSON.stringify(catalog, null, 2));
    return 0;
  }

  log(`${catalog.templates.length} bundled template${catalog.templates.length === 1 ? "" : "s"}:`);
  for (const template of catalog.templates) {
    const duration = template.preferredDuration ? ` · ~${template.preferredDuration}s` : "";
    const jobs = template.jobs.length ? ` · ${template.jobs.join(", ")}` : "";
    log(`\n  ${template.id}  [${template.category}]${jobs}${duration}`);
    log(`      ${template.useWhen}`);
    log(`      variables: ${variableSummary(template.variableSchema) || "none"}`);
  }

  if (!id) {
    log("\nUse `vanillasky templates <id> --json` for one complete schema.");
    log("An asterisk marks a required variable. Defaults remain examples, not finished copy.");
  }
  return 0;
}
