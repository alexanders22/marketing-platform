// Who operates Khma, as shown on the legal pages (env, read at build time).
// Set LEGAL_ENTITY / LEGAL_ENTITY_ID / LEGAL_ADDRESS before the Meta app
// review — empty fields are simply left out of the pages.
export const LEGAL = {
  service: "Khma",
  entity: process.env.LEGAL_ENTITY ?? "",
  entityId: process.env.LEGAL_ENTITY_ID ?? "",
  address: process.env.LEGAL_ADDRESS ?? "",
  country: "Georgia",
  email: "info@brandrepublic.ge",
  site: "https://khma.brandrepublic.ge",
  updated: "2 October 2026",
};

// "Khma, operated by X (ID …), address" — or just "Khma" until filled in.
export function operator() {
  const who = [LEGAL.entity, LEGAL.entityId && `ID ${LEGAL.entityId}`].filter(Boolean).join(", ");
  return who ? `${LEGAL.service}, operated by ${who}${LEGAL.address ? `, ${LEGAL.address}` : ""}` : LEGAL.service;
}
