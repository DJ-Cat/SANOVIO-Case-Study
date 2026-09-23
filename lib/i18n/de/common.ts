/**
 * Shared chrome: the portal chooser, the rail, the preference switch, and the
 * badges every page uses. Formal "Sie" throughout, as a procurement tool
 * addresses its users in German-speaking Switzerland and Germany.
 */
const de: Record<string, string> = {
  // Preferences
  "Language": "Sprache",
  "Currency": "Währung",
  "Prices are converted at the day's reference rate — an estimate, not a quote.":
    "Preise werden zum Referenzkurs des Tages umgerechnet — eine Schätzung, kein Angebot.",
  "{original}, converted at the {source} rate of {date}": "{original}, umgerechnet zum {source}kurs vom {date}",
  "ECB reference": "EZB-Referenz",
  "approximate": "Näherungs",

  // Portal chooser
  "Demo edition — filled with sample data, reset any time": "Demo-Version — mit Beispieldaten gefüllt, jederzeit zurücksetzbar",
  "Choose your portal": "Portal wählen",
  "Hospitals and manufacturers work in separate portals. They share one harmonised product catalogue and nothing else — a manufacturer never sees a hospital's procurement strategy.":
    "Spitäler und Hersteller arbeiten in getrennten Portalen. Sie teilen einen harmonisierten Produktkatalog und sonst nichts — ein Hersteller sieht nie die Beschaffungsstrategie eines Spitals.",
  "Hospital procurement": "Spitaleinkauf",
  "Upload your article master, work the suggested replacements, clear what still needs a signature, and approve orders into the pool.":
    "Laden Sie Ihren Artikelstamm hoch, bearbeiten Sie die vorgeschlagenen Ersatzprodukte, klären Sie, was noch eine Unterschrift braucht, und geben Sie Bestellungen in den Pool frei.",
  "articles": "Artikel",
  "suggestions": "Vorschläge",
  "open reviews": "offene Prüfungen",
  "Enter hospital portal": "Zum Spitalportal",
  "Manufacturer catalogue": "Herstellerkatalog",
  "Upload your catalogue, confirm what extraction was unsure about, set volume pricing, and answer hospitals in Messages.":
    "Laden Sie Ihren Katalog hoch, bestätigen Sie, wo die Extraktion unsicher war, legen Sie Staffelpreise fest und beantworten Sie Spitäler unter Nachrichten.",
  "catalogue rows": "Katalogzeilen",
  "products": "Produkte",
  "open questions": "offene Fragen",
  "Enter supplier portal": "Zum Lieferantenportal",
  "Platform operations": "Plattformbetrieb",
  "Matching pipeline observability: which layer resolved what, what it cost, and the confidence thresholds in force.":
    "Einblick in die Matching-Pipeline: welche Stufe was zugeordnet hat, was es gekostet hat und welche Konfidenzschwellen gelten.",
  "links": "Verknüpfungen",
  "match runs": "Matching-Läufe",
  "Enter operations": "Zum Betrieb",

  // Rail and layouts
  "Show menu": "Menü einblenden",
  "Hide menu": "Menü ausblenden",
  "{n} unread": "{n} ungelesen",
  "Switch portal": "Portal wechseln",
  "Demo edition — sample data. Reset it any time with npm run demo:reset.":
    "Demo-Version — Beispieldaten. Jederzeit zurücksetzbar mit npm run demo:reset.",
  "Demo data": "Demodaten",
  "SANOVIO — choose a portal": "SANOVIO — Portal wählen",
  "Back": "Zurück",
  "Hospital portal": "Spitalportal",
  "A. Vogt (Buyer)": "A. Vogt (Einkauf)",
  "Cockpit": "Cockpit",
  "Catalogue": "Katalog",
  "Documents": "Dokumente",
  "Approvals": "Freigaben",
  "Messages": "Nachrichten",
  "Supplier portal": "Lieferantenportal",
  "manufacturer workspace": "Herstellerbereich",
  "Manufacturer workspace": "Herstellerbereich",
  "Upload catalogue": "Katalog hochladen",
  "Pricing": "Preise",
  "SANOVIO operations": "SANOVIO Betrieb",
  "Internal — pipeline and documents": "Intern — Pipeline und Dokumente",
  "Overview": "Übersicht",
  "Matching pipeline": "Matching-Pipeline",
  "Uploaded documents": "Hochgeladene Dokumente",

  // Badges
  "Same article · direct": "Gleicher Artikel · direkt",
  "Substitute · different article": "Ersatz · anderer Artikel",
  "Class I — low risk": "Klasse I — geringes Risiko",
  "Class IIa — medium risk": "Klasse IIa — mittleres Risiko",
  "Class IIb — high risk": "Klasse IIb — hohes Risiko",
  "Class III — highest risk": "Klasse III — höchstes Risiko",
  "No saving can be stated without a price": "Ohne Preis lässt sich keine Einsparung angeben",
  "No price yet": "Noch kein Preis",
  "clears the bar of {threshold}": "erreicht die Schwelle von {threshold}",
  "below the bar of {threshold}": "unter der Schwelle von {threshold}",
  "{value} out of 100": "{value} von 100",
  "Identical": "Identisch",
  "Equivalent": "Gleichwertig",
  "Not equivalent": "Nicht gleichwertig",

  // Specification quantities (app/components/format.ts)
  "Outer diameter": "Aussendurchmesser",
  "Length": "Länge",
  "Size": "Grösse",
  "Volume": "Volumen",
  "Width": "Breite",
  "Gauge": "Gauge",
  "Wall": "Wandstärke",
  "Hub colour": "Konusfarbe",
  "Connector": "Anschluss",
  "Material": "Material",
  "Sterile": "Steril",
  "PZN": "PZN",
  "Fixation": "Fixierung",
};

export default de;
