/**
 * What the server says back: action outcomes, validation errors from
 * lib/workflow.ts, lib/replacement.ts, lib/messaging.ts and lib/ingest, and
 * the reasons an order cannot be placed yet. Templates keep their
 * {placeholders} exactly as the English has them.
 */
const de: Record<string, string> = {
  // Session
  "No manufacturer is signed in.": "Kein Hersteller ist angemeldet.",

  // Uploads (lib/workflow.ts, lib/ingest)
  "Choose a file to upload.": "Wählen Sie eine Datei zum Hochladen.",
  "Choose which manufacturer this catalogue belongs to.": "Wählen Sie, zu welchem Hersteller dieser Katalog gehört.",
  "{file}: {rows} article rows read.": "{file}: {rows} Artikelzeilen gelesen.",
  "{accepted} accepted, {held} held for review.": "{accepted} übernommen, {held} zur Prüfung zurückgehalten.",
  "All {accepted} rows cleared the extraction threshold.": "Alle {accepted} Zeilen haben die Extraktionsschwelle erreicht.",
  "{file}: {rows} SKUs read, {created} products created.": "{file}: {rows} Artikel gelesen, {created} Produkte angelegt.",
  "{file}: {rows} SKUs read, {created} products created, {images} product image(s) recovered.":
    "{file}: {rows} Artikel gelesen, {created} Produkte angelegt, {images} Produktbild(er) übernommen.",
  "{n} row(s) held for review": "{n} Zeile(n) zur Prüfung zurückgehalten",
  "{n} row(s) below the extraction threshold": "{n} Zeile(n) unter der Extraktionsschwelle",
  "{n} row(s) from pages extract_lib could not validate against the text layer":
    "{n} Zeile(n) von Seiten, die extract_lib nicht gegen die Textebene prüfen konnte",
  "pages {pages} could not be extracted at all — the rest were kept":
    "Die Seiten {pages} konnten gar nicht extrahiert werden — der Rest wurde übernommen",
  "Could not read {file}: {reason}": "{file} konnte nicht gelesen werden: {reason}",
  "No article rows found in {file}. Expected columns such as Artikelbezeichnung, Jahresmenge and Netto-Zielpreis (or the English equivalents).":
    "In {file} wurden keine Artikelzeilen gefunden. Erwartet werden Spalten wie Artikelbezeichnung, Jahresmenge und Netto-Zielpreis (oder die englischen Entsprechungen).",
  "{file} is not a PDF, CSV or Excel file.": "{file} ist keine PDF-, CSV- oder Excel-Datei.",
  "No catalogue rows found in {file}. Expected columns such as Artikelbezeichnung, Artikelnummer and Preis.":
    "In {file} wurden keine Katalogzeilen gefunden. Erwartet werden Spalten wie Artikelbezeichnung, Artikelnummer und Preis.",
  "extract_lib found no product rows in {file}. Pages without a product table return nothing by design; if this catalogue does have tables, see report.json.":
    "extract_lib hat in {file} keine Produktzeilen gefunden. Seiten ohne Produkttabelle liefern bewusst nichts; falls dieser Katalog Tabellen enthält, siehe report.json.",

  // A manufacturer editing its product
  "Description saved.": "Beschreibung gespeichert.",
  "Every tier needs a price.": "Jede Preisstufe braucht einen Preis.",
  "Saved {n} tier.": "{n} Preisstufe gespeichert.",
  "Saved {n} tiers.": "{n} Preisstufen gespeichert.",
  "Price removed — the product stays listed but cannot be quoted.":
    "Preis entfernt — das Produkt bleibt gelistet, kann aber nicht angeboten werden.",
  "Add at least one tier, or delete the price entirely.": "Fügen Sie mindestens eine Preisstufe hinzu oder löschen Sie den Preis ganz.",
  "Every tier needs a price greater than zero.": "Jede Preisstufe braucht einen Preis über null.",
  "A tier cannot start below zero units.": "Eine Preisstufe kann nicht unter null Einheiten beginnen.",
  "Two tiers start at the same quantity — each one needs its own floor.":
    "Zwei Preisstufen beginnen bei derselben Menge — jede braucht ihre eigene Untergrenze.",
  "Nothing changed.": "Nichts geändert.",
  "Details saved.": "Angaben gespeichert.",
  "That is not one of your products.": "Das ist keines Ihrer Produkte.",
  "Choose a risk class: I, IIa, IIb or III.": "Wählen Sie eine Risikoklasse: I, IIa, IIb oder III.",
  "A product needs a unit — what one price is for.": "Ein Produkt braucht eine Einheit — wofür ein Preis gilt.",
  "A pack holds at least one unit.": "Eine Packung enthält mindestens eine Einheit.",
  "A product needs an article number.": "Ein Produkt braucht eine Artikelnummer.",
  "Article number {sku} is already used by another of your products.":
    "Die Artikelnummer {sku} wird bereits von einem anderen Ihrer Produkte verwendet.",
  "Choose an image first.": "Wählen Sie zuerst ein Bild.",
  "{file} added.": "{file} hinzugefügt.",
  "That file is empty.": "Diese Datei ist leer.",
  "{file} is not a PNG, JPEG, WebP or GIF image.": "{file} ist kein PNG-, JPEG-, WebP- oder GIF-Bild.",
  "{file} is {size} MB; the limit is {limit} MB.": "{file} ist {size} MB gross; die Grenze liegt bei {limit} MB.",

  // Choosing and ordering a replacement (lib/replacement.ts)
  "Replacement recorded.": "Ersatzprodukt erfasst.",
  "Replacement withdrawn.": "Ersatzprodukt zurückgezogen.",
  "That line is not in your article master.": "Diese Position ist nicht in Ihrem Artikelstamm.",
  "That product no longer exists.": "Dieses Produkt existiert nicht mehr.",
  "This item's current replacement has already been ordered. Reject that order under Approvals before choosing another product.":
    "Das aktuelle Ersatzprodukt für diesen Artikel wurde bereits bestellt. Lehnen Sie diese Bestellung unter Freigaben ab, bevor Sie ein anderes Produkt wählen.",
  "This replacement has been ordered. Reject the order under Approvals to withdraw it.":
    "Dieses Ersatzprodukt wurde bestellt. Lehnen Sie die Bestellung unter Freigaben ab, um es zurückzuziehen.",
  "The replacement was withdrawn.": "Das Ersatzprodukt wurde zurückgezogen.",
  "The line or the product no longer exists.": "Die Position oder das Produkt existiert nicht mehr.",
  "That replacement no longer exists.": "Dieses Ersatzprodukt existiert nicht mehr.",
  "Ordered — waiting for clinical sign-off, then budget approval.":
    "Bestellt — wartet auf die klinische Freigabe, danach auf die Budgetfreigabe.",
  "Ordered — waiting for budget approval.": "Bestellt — wartet auf die Budgetfreigabe.",
  "It has already been ordered.": "Es wurde bereits bestellt.",
  "The match analysis failed — run it again first.": "Die Abgleichsanalyse ist fehlgeschlagen — führen Sie sie zuerst erneut aus.",
  "The match is still being calculated.": "Der Abgleich wird noch berechnet.",
  "{n} blocking point still needs signing off.": "{n} blockierender Punkt muss noch freigegeben werden.",
  "{n} blocking points still need signing off.": "{n} blockierende Punkte müssen noch freigegeben werden.",
  "{manufacturer} has not published a price yet.": "{manufacturer} hat noch keinen Preis veröffentlicht.",
  "The manufacturer has not published a price yet.": "Der Hersteller hat noch keinen Preis veröffentlicht.",
  "Today's price for this item is unknown, so the order has no baseline.":
    "Der heutige Preis für diesen Artikel ist unbekannt, daher fehlt der Bestellung die Vergleichsbasis.",
  "Today's price is per {uom} in {currency}, the offer per {offerUom} in {offerCurrency} — settle the basis first.":
    "Der heutige Preis gilt pro {uom} in {currency}, das Angebot pro {offerUom} in {offerCurrency} — klären Sie zuerst die Basis.",
  "The item has no annual volume to order.": "Der Artikel hat keine Jahresmenge, die bestellt werden könnte.",
  "Unknown item or product.": "Unbekannter Artikel oder unbekanntes Produkt.",

  // Messages (lib/messaging.ts)
  "Sent.": "Gesendet.",
  "A message needs some text.": "Eine Nachricht braucht Text.",
  "That message is too long — 4,000 characters at most.": "Diese Nachricht ist zu lang — höchstens 4000 Zeichen.",
  "Not your conversation.": "Nicht Ihre Unterhaltung.",
  "That manufacturer does not exist.": "Dieser Hersteller existiert nicht.",
  "A manufacturer can only reply to a hospital that wrote to it.":
    "Ein Hersteller kann nur einem Spital antworten, das ihm geschrieben hat.",
  "That question is not part of this conversation.": "Diese Frage gehört nicht zu dieser Unterhaltung.",
};

export default de;
