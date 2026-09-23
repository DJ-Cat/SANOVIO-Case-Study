/**
 * The hospital's product page, its picture, and the "Replace with this"
 * dialog.
 */
const de: Record<string, string> = {
  "via {supplier}": "über {supplier}",
  "{volume} {uom}/yr": "{volume} {uom}/Jahr",
  // Header facts
  "Manufacturer": "Hersteller",
  "Risk class": "Risikoklasse",
  "Unit": "Einheit",
  "per {uom}": "pro {uom}",
  "{n} per pack": "{n} pro Packung",
  "Replacing": "Ersetzt",
  "Suggested for": "Vorgeschlagen für",
  "Compared with": "Verglichen mit",
  "You are replacing": "Sie ersetzen",
  "Would replace": "Würde ersetzen",

  // Tabs
  "Product views": "Produktansichten",
  "Open problems": "Offene Punkte",
  "{n} open": "{n} offen",
  "There is nothing to compare this against yet. Upload your article master, or open this product from a suggestion, and the comparison will name the line it replaces.":
    "Es gibt noch nichts, womit sich dieses Produkt vergleichen liesse. Laden Sie Ihren Artikelstamm hoch oder öffnen Sie das Produkt aus einem Vorschlag, dann nennt der Vergleich die Zeile, die es ersetzt.",

  // Overview
  "From {manufacturer}": "Von {manufacturer}",
  "Specification": "Spezifikation",
  "Nothing extracted for this article.": "Für diesen Artikel wurde nichts extrahiert.",
  "Classification": "Klassifizierung",
  "MDR class": "MDR-Klasse",
  "Pack size": "Packungsgrösse",

  // Price card
  "Direct price": "Direktpreis",
  "Not published": "Nicht veröffentlicht",
  "{manufacturer}'s catalogue carried no prices, and the platform does not estimate them. The product is matchable; a quote follows once the manufacturer sets a price.":
    "Der Katalog von {manufacturer} enthielt keine Preise, und die Plattform schätzt keine. Das Produkt ist zuordenbar; ein Angebot folgt, sobald der Hersteller einen Preis festlegt.",
  "stated in the catalogue": "laut Katalog",
  "set by the manufacturer": "vom Hersteller festgelegt",
  "You pay today": "Sie zahlen heute",
  "Not on file": "Nicht erfasst",
  "for {line}": "für {line}",
  "no line to compare against": "keine Vergleichszeile",
  "Saving": "Einsparung",
  "none — dearer than today": "keine — teurer als heute",

  // The line being replaced
  "From your article master": "Aus Ihrem Artikelstamm",
  "Continue to order": "Weiter zur Bestellung",
  "Annual volume": "Jahresmenge",
  "Bought via": "Bezogen über",
  "Pack": "Packung",
  "single": "einzeln",
  "Declared class": "Angegebene Klasse",

  // Previous replacements
  "Previous replacements": "Frühere Ersetzungen",
  "No replacement has been ordered on this product yet.": "Für dieses Produkt wurde noch keine Ersetzung bestellt.",
  "Date": "Datum",
  "Change": "Änderung",
  "Supplier": "Lieferant",
  "Status": "Status",
  "Brought in": "Eingeführt",
  "Replaced": "Ersetzt",
  "clinical sign-off": "klinische Freigabe",
  "awaiting approval": "wartet auf Freigabe",
  "approved": "freigegeben",
  "awaiting placement": "wartet auf Platzierung",
  "in fulfilment": "in Abwicklung",
  "delivered": "geliefert",

  // Product picture
  "No manufacturer image on file — this is the {category} category, drawn from ECLASS {eclass}. Not a photograph of the article.":
    "Kein Herstellerbild vorhanden — dies ist die Kategorie {category}, gezeichnet nach ECLASS {eclass}. Kein Foto des Artikels.",
  "No manufacturer image on file — this is the {category} category, drawn from ECLASS. Not a photograph of the article.":
    "Kein Herstellerbild vorhanden — dies ist die Kategorie {category}, gezeichnet nach ECLASS. Kein Foto des Artikels.",
  "From the manufacturer's catalogue, page {page}": "Aus dem Herstellerkatalog, Seite {page}",
  "From the manufacturer's catalogue": "Aus dem Herstellerkatalog",
  "Shows the product family, not this size specifically.": "Zeigt die Produktfamilie, nicht speziell diese Grösse.",
  "Matched to this article by layout, not by a caption.": "Diesem Artikel anhand des Layouts zugeordnet, nicht anhand einer Bildunterschrift.",
  "Uncertain match — confirm this is the right article before ordering.": "Unsichere Zuordnung — prüfen Sie vor der Bestellung, ob es der richtige Artikel ist.",
  "cannula": "Kanüle",
  "syringe": "Spritze",
  "infusion set": "Infusionsset",
  "glove": "Handschuh",
  "mask": "Maske",
  "wound care": "Wundversorgung",
  "disinfectant": "Desinfektionsmittel",
  "consumable": "Verbrauchsmaterial",

  // Replace with this
  "Replace with this": "Hiermit ersetzen",
  "The match is already calculated": "Der Abgleich ist bereits berechnet",
  "It was analysed in advance when it was suggested, on the same data it has now, so its points are ready to sign off or send.":
    "Es wurde schon beim Vorschlag auf denselben Daten analysiert, die jetzt vorliegen. Die Punkte können also direkt freigegeben oder gesendet werden.",
  "Review the points": "Punkte prüfen",
  "The match is being calculated": "Der Abgleich wird berechnet",
  "Price, replaceability, safety and correctness are being checked — this takes a minute or two.":
    "Preis, Austauschbarkeit, Sicherheit und Korrektheit werden geprüft — das dauert ein bis zwei Minuten.",
  "The points it finds appear on this product page and in your catalogue as they land.":
    "Gefundene Punkte erscheinen laufend auf dieser Produktseite und in Ihrem Katalog.",
  "Back to the product": "Zurück zum Produkt",
  "Which article from your catalogue does it replace?": "Welchen Artikel aus Ihrem Katalog ersetzt es?",
  "Choose an article…": "Artikel wählen…",
  "Confirming starts a match against that article: price, replaceability, safety and correctness, looked up on the web where the catalogue data runs out. Each issue it finds becomes a point you can sign off yourself or send to {manufacturer}.":
    "Mit der Bestätigung startet ein Abgleich mit diesem Artikel: Preis, Austauschbarkeit, Sicherheit und Korrektheit, ergänzt durch eine Websuche, wo die Katalogdaten nicht ausreichen. Jedes gefundene Problem wird zu einem Punkt, den Sie selbst freigeben oder an {manufacturer} senden können.",
  "Cancel": "Abbrechen",
  "Confirming…": "Wird bestätigt…",
  "Confirm": "Bestätigen",
  "This is already the chosen replacement for that line. Confirming changes nothing.":
    "Dies ist bereits der gewählte Ersatz für diese Zeile. Eine Bestätigung ändert nichts.",
  "Confirming switches it to this product. Points you signed off or sent stay on record.":
    "Mit der Bestätigung wechselt sie zu diesem Produkt. Punkte, die Sie freigegeben oder gesendet haben, bleiben erfasst.",
  "This is the article that line already is — the switch is to buying it direct, not to a different product.":
    "Diese Zeile ist bereits dieser Artikel — gewechselt wird zum Direktbezug, nicht zu einem anderen Produkt.",
};

export default de;
