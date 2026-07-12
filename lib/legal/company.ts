// Single source of truth for the company's identity on legal / customer-facing
// surfaces (unsubscribe page, email footer, consent copy, Terms & Privacy).
// Centralised so the name, contact, address and ABN never drift between places.
//
// Values here are the ones ALREADY used across the app; the only field not yet
// supplied is the ABN — left as null so surfaces render an explicit "(ABN: TBC)"
// marker rather than a fabricated number. Fill `abn` (and, if the entity is a
// company, its registered "... Pty Ltd" legalEntity + acn) before going live on
// anything a solicitor would review.

export interface CompanyIdentity {
  /** Public trading name shown everywhere. */
  tradingName: string;
  /** Registered legal entity, e.g. "APMG Services Pty Ltd". Null until supplied
   *  — the Terms/Privacy copy should use this once known; other surfaces are
   *  fine with the trading name. */
  legalEntity: string | null;
  /** Australian Business Number (11 digits, spaced for display). Null = TBC. */
  abn: string | null;
  /** Australian Company Number (companies only). Null when N/A or TBC. */
  acn: string | null;
  /** Registered / place-of-business address. */
  address: string;
  /** Contact + privacy/data-request email. */
  contactEmail: string;
  /** Public website. */
  website: string;
}

export const COMPANY: CompanyIdentity = {
  tradingName: "APMG Services",
  legalEntity: null, // TODO: set the registered entity (e.g. "APMG Services Pty Ltd") for the legal docs
  abn: null, // TODO: set the ABN before going live; null renders "(ABN: TBC)"
  acn: null,
  address: "1 Tesmar Cct, Chirnside Park, VIC, Australia",
  contactEmail: "kane@apmgservices.com.au",
  website: "https://www.apmgservices.com.au/",
};

/** Name to use where a legal entity is expected (Terms/Privacy): the registered
 *  entity if known, otherwise the trading name with a clear "trading as" note so
 *  we never pass a trading name off as the registered entity. */
export function legalName(): string {
  return COMPANY.legalEntity ?? `${COMPANY.tradingName} (trading name)`;
}

/** ABN line for display, or an explicit TBC marker so a missing ABN is obvious
 *  (and never silently absent) on the surfaces that show it. */
export function abnLine(): string {
  return COMPANY.abn ? `ABN ${COMPANY.abn}` : "ABN: TBC";
}

/** One-line sender identifier for email footers / unsubscribe (Spam Act sender
 *  identification): "APMG Services · 1 Tesmar Cct, Chirnside Park, VIC · ABN …".
 *  The ABN segment is shown only once a real ABN is set. */
export function senderIdentityLine(): string {
  const parts = [COMPANY.tradingName, COMPANY.address];
  if (COMPANY.abn) parts.push(`ABN ${COMPANY.abn}`);
  return parts.join(" · ");
}
