/**
 * The switch analysis: the status banners above a product, ordering a chosen
 * replacement, and the Open problems tab with its points.
 */
const de: Record<string, string> = {
  // Banners
  "Calculating": "Wird berechnet",
  "Not calculated": "Nicht berechnet",
  "The match for {line} could not be calculated.": "Der Abgleich für {line} konnte nicht berechnet werden.",
  "Starting…": "Wird gestartet…",
  "Try again": "Erneut versuchen",
  "Signed off": "Abgezeichnet",
  "Nothing to settle": "Nichts zu klären",
  "{n} blocking": "{n} blockierend",
  "Open": "Offen",
  "All {n} points signed off.": "Alle {n} Punkte abgezeichnet.",
  "The analysis raised nothing to settle.": "Die Analyse hat nichts Klärungsbedürftiges ergeben.",
  "open point": "offener Punkt",
  "open points": "offene Punkte",
  "{n} signed off": "{n} abgezeichnet",
  "Review points": "Punkte prüfen",
  "Same article": "Gleicher Artikel",
  "Substitute": "Ersatz",
  "Suggested": "Vorgeschlagen",
  "{n} % match": "{n} % Übereinstimmung",
  "Analysing the switch…": "Wechsel wird analysiert…",
  "point": "Punkt",
  "points": "Punkte",
  "See points": "Punkte ansehen",
  "Why": "Warum",

  // Ordering
  "awaiting clinical sign-off": "wartet auf klinische Abzeichnung",
  "awaiting budget approval": "wartet auf Budgetfreigabe",
  "approved": "freigegeben",
  "approved · in the pool": "freigegeben · im Pool",
  "in fulfilment": "in Abwicklung",
  "delivered": "geliefert",
  "Ordered": "Bestellt",
  "Open approvals": "Freigaben öffnen",
  "{price} per unit · {volume} a year": "{price} pro Einheit · {volume} pro Jahr",
  "Order this replacement": "Dieses Ersatzprodukt bestellen",
  "Order this replacement?": "Dieses Ersatzprodukt bestellen?",
  "Place order": "Bestellung aufgeben",
  "Annual volume": "Jahresmenge",
  "{n} units": "{n} Einheiten",
  "Unit price": "Stückpreis",
  "at the pool's current tier": "zur aktuellen Staffel des Pools",
  "Today": "Heute",
  "Extra cost per year": "Mehrkosten pro Jahr",
  "Saving per year": "Einsparung pro Jahr",
  "A change of article at this risk class goes to clinical sign-off first, then to budget approval.":
    "Ein Artikelwechsel in dieser Risikoklasse geht zuerst zur klinischen Abzeichnung, dann zur Budgetfreigabe.",
  "It goes to budget approval, then joins the pool.": "Die Bestellung geht zur Budgetfreigabe und dann in den Pool.",
  "1 non-blocking point is still open; it does not hold the order up.":
    "1 nicht blockierender Punkt ist noch offen; er hält die Bestellung nicht auf.",
  "{n} non-blocking points are still open; they do not hold the order up.":
    "{n} nicht blockierende Punkte sind noch offen; sie halten die Bestellung nicht auf.",

  // Point categories
  "Safety": "Sicherheit",
  "Risk class, sterility, materials, recalls": "Risikoklasse, Sterilität, Materialien, Rückrufe",
  "Replaceability": "Ersetzbarkeit",
  "Will it do the same job": "Erfüllt es denselben Zweck",
  "Price": "Preis",
  "What the switch costs": "Was der Wechsel kostet",
  "Correctness": "Korrektheit",
  "Can the data be trusted": "Sind die Daten verlässlich",
  "Other questions": "Weitere Fragen",
  "Raised before the replacement was chosen": "Vor der Wahl des Ersatzprodukts gestellt",

  // The analysis card
  "Calculating the match against {line}": "Abgleich mit {line} wird berechnet",
  "Reading both specifications, the prices, and what the manufacturer publishes about this article.":
    "Beide Spezifikationen, die Preise und die Herstellerangaben zu diesem Artikel werden gelesen.",
  "The analysis failed: {error}": "Die Analyse ist fehlgeschlagen: {error}",
  "The analysis failed.": "Die Analyse ist fehlgeschlagen.",
  "AI verdict": "KI-Urteil",
  "{n} % confidence": "{n} % Konfidenz",
  "Run again": "Erneut ausführen",
  "Withdraw replacement": "Ersatzprodukt zurückziehen",
  "Analysed by": "Analysiert von",
  "Web searches": "Websuchen",
  "Date": "Datum",
  "1 page consulted": "1 Seite herangezogen",
  "{n} pages consulted": "{n} Seiten herangezogen",
  "Replace with this": "Hiermit ersetzen",
  "Nothing stands out. The analysis found no issue with this switch.":
    "Nichts Auffälliges. Die Analyse hat bei diesem Wechsel kein Problem gefunden.",
  "Should not be ordered until signed off. A manufacturer's answer still needs your sign-off.":
    "Sollte erst nach Abzeichnung bestellt werden. Auch eine Antwort des Herstellers braucht noch Ihre Abzeichnung.",
  "Withdraw this replacement?": "Dieses Ersatzprodukt zurückziehen?",
  "{line} goes back to having no replacement. Points you signed off or sent stay on record; the rest of the analysis is discarded.":
    "{line} hat danach wieder kein Ersatzprodukt. Abgezeichnete oder gesendete Punkte bleiben dokumentiert; der Rest der Analyse wird verworfen.",
  "Withdraw": "Zurückziehen",

  // A point
  "Answered": "Beantwortet",
  "With manufacturer": "Beim Hersteller",
  "Blocking": "Blockierend",
  "Hospital": "Spital",
  "sent by you": "von Ihnen gesendet",
  "analysis": "Analyse",
  "raised": "erfasst",
  "Manufacturer can clarify": "Hersteller kann klären",
  "Your decision": "Ihre Entscheidung",
  "Sign off": "Abzeichnen",
  "This product has no manufacturer on the platform to ask": "Zu diesem Produkt gibt es keinen Hersteller auf der Plattform, den man fragen könnte",
  "Sent": "Gesendet",
  "Send to supplier": "An Lieferanten senden",
  "Sign off this point?": "Diesen Punkt abzeichnen?",
  "You are recording that the hospital accepts {product} as a replacement despite this point. It stays on record with your name and the time, and is not sent to {manufacturer}.":
    "Sie halten fest, dass das Spital {product} trotz dieses Punkts als Ersatzprodukt akzeptiert. Dies wird mit Ihrem Namen und der Uhrzeit dokumentiert und nicht an {manufacturer} gesendet.",
  "A safety point is recorded as the clinical sign-off, not the buyer's.":
    "Ein Sicherheitspunkt wird als klinische Abzeichnung erfasst, nicht als die des Einkaufs.",
  "Yes, sign it off": "Ja, abzeichnen",
  "Cancel": "Abbrechen",
  "Saving…": "Wird gespeichert…",

  // The browse-time comparison
  "Comparing against {line}": "Vergleich mit {line}",
  "Reading both specifications and working out what would stop this substitution being signed off.":
    "Beide Spezifikationen werden gelesen, um zu ermitteln, was einer Abzeichnung dieses Ersatzes im Weg stünde.",
  "Not run": "Nicht ausgeführt",
  "The comparison could not be run.": "Der Vergleich konnte nicht ausgeführt werden.",
  "re-running": "wird erneut ausgeführt",
  "Nothing outstanding. Every attribute the platform holds for both articles agrees.":
    "Nichts offen. Alle Merkmale, die die Plattform zu beiden Artikeln kennt, stimmen überein.",
  "This substitution cannot be ordered until they are resolved.":
    "Dieser Ersatz kann erst bestellt werden, wenn sie geklärt sind.",
  "Manufacturer can answer": "Hersteller kann antworten",
  "SANOVIO to resolve": "Klärung durch SANOVIO",
  "Cleared": "Erledigt",
  "Only SANOVIO can resolve this one": "Diesen Punkt kann nur SANOVIO klären",
  "Answer": "Antwort",
  "Clear this question?": "Diese Frage als erledigt markieren?",
  "You are recording that it does not apply to {product}. It leaves your worklist and is not sent to the manufacturer.":
    "Sie halten fest, dass sie auf {product} nicht zutrifft. Sie verschwindet aus Ihrer Arbeitsliste und wird nicht an den Hersteller gesendet.",
  "This one is blocking. Clearing it removes the barrier to ordering.":
    "Diese Frage ist blockierend. Wird sie erledigt, entfällt die Bestellsperre.",
  "Keep it": "Behalten",
  "Clearing…": "Wird erledigt…",
  "Yes, clear it": "Ja, erledigen",
};

export default de;
