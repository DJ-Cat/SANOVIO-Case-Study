/**
 * The supplier portal: catalogue, upload, pricing, the product page and its
 * editors (pictures, description, price ladder, product details).
 */
const de: Record<string, string> = {
  "upload a catalogue": "laden Sie einen Katalog hoch,",
  // Shared words these pages use
  "No manufacturer is signed in.": "Kein Hersteller ist angemeldet.",
  "Save": "Speichern",
  "Saving…": "Wird gespeichert…",
  "Cancel": "Abbrechen",
  "Status": "Status",
  "Price": "Preis",
  "Product": "Produkt",
  "Article": "Artikel",
  "Name": "Name",
  "Description": "Beschreibung",
  "Source": "Quelle",
  "Confidence": "Konfidenz",
  "Extraction": "Extraktion",
  "Specification": "Spezifikation",
  "Risk class": "Risikoklasse",
  "Unit": "Einheit",
  "unit": "Einheit",
  "Article no.": "Artikelnummer",
  "Art. no.": "Art.-Nr.",
  "art.": "Art.",
  "p.": "S.",
  "per {uom}": "pro {uom}",
  "{n} per pack": "{n} pro Packung",
  "Page {page} of {file}": "Seite {page} von {file}",
  "page {page}": "Seite {page}",
  "your catalogue": "Ihr Katalog",
  "your company": "Ihr Unternehmen",
  "Showing {shown} of {total}.": "{shown} von {total} angezeigt.",
  "none": "keins",
  "value": "Wert",
  "unchecked": "ungeprüft",
  "active": "aktiv",
  "linked": "verknüpft",
  "certain": "sicher",
  "likely": "wahrscheinlich",
  "uncertain": "unsicher",

  // Catalogue (app/supplier/page.tsx)
  "Catalogue uploaded and extracted. Rows below the extraction threshold surface at the top rather than being buried in a tab — a bad extraction must never silently produce a savings claim to a hospital.":
    "Katalog hochgeladen und extrahiert. Zeilen unter der Extraktionsschwelle erscheinen oben, statt in einem Reiter zu verschwinden — eine fehlerhafte Extraktion darf nie stillschweigend eine Einsparung gegenüber einem Spital behaupten.",
  "Catalogue rows": "Katalogzeilen",
  "Linked to a canonical product": "Mit einem kanonischen Produkt verknüpft",
  "Needs review": "Zu prüfen",
  "below {threshold} extraction confidence": "unter {threshold} Extraktionskonfidenz",
  "With product image": "Mit Produktbild",
  "recovered from your catalogue PDF": "aus Ihrem Katalog-PDF übernommen",
  "Row": "Zeile",
  "Missing": "Fehlt",
  "Correct & confirm": "Korrigieren & bestätigen",
  "Dimensions": "Abmessungen",
  "Pack size": "Packungsgrösse",
  "Confirm as read": "Wie gelesen bestätigen",
  "No catalogue rows yet —": "Noch keine Katalogzeilen —",
  "and every row read out of it appears here.": "und jede daraus gelesene Zeile erscheint hier.",
  "read as {name}": "gelesen als {name}",
  "no price": "kein Preis",

  // Upload (app/supplier/upload/page.tsx)
  "Your product catalogue, filed against {company}. A PDF is read by extract_lib — one record per table row, with the product photography attached. Rows that extract cleanly become canonical products other participants can be matched against; rows that do not go to your review queue rather than into the index.":
    "Ihr Produktkatalog, abgelegt unter {company}. Ein PDF wird von extract_lib gelesen — ein Datensatz pro Tabellenzeile, mit den zugehörigen Produktfotos. Sauber extrahierte Zeilen werden zu kanonischen Produkten, mit denen andere Teilnehmer abgeglichen werden können; die übrigen kommen in Ihre Prüfliste statt in den Index.",
  "PDF, CSV or Excel — product tables keyed by article number": "PDF, CSV oder Excel — Produkttabellen nach Artikelnummer",
  "What happens on upload": "Was beim Hochladen geschieht",
  "Figures": "Abbildungen",
  "every product photograph is cut from the page and kept with the SKU it depicts.":
    "jedes Produktfoto wird aus der Seite ausgeschnitten und dem abgebildeten Artikel zugeordnet.",
  "one record per table row, read from the page render and the text layer together.":
    "ein Datensatz pro Tabellenzeile, gelesen aus Seitenbild und Textebene zusammen.",
  "Validation": "Validierung",
  "every part number is checked back against the page text. One that is not there is dropped, not guessed.":
    "jede Artikelnummer wird gegen den Seitentext geprüft. Fehlt sie dort, wird sie verworfen, nicht geraten.",
  "Canonical products": "Kanonische Produkte",
  "accepted rows define product identity; your catalogue is the authority for your own articles.":
    "übernommene Zeilen bestimmen die Produktidentität; für Ihre eigenen Artikel ist Ihr Katalog massgebend.",
  "Pricing": "Preise",
  "a PDF carries no prices and none are invented. Set them under Pricing.":
    "ein PDF enthält keine Preise, und es werden keine erfunden. Legen Sie sie unter Preise fest.",
  "A PDF runs the full extractor and takes a few minutes; the page waits for it. Rows from a page whose output failed validation are held below the threshold on purpose — a value we could not confirm against the page is never guessed.":
    "Ein PDF durchläuft die vollständige Extraktion und dauert einige Minuten; die Seite wartet darauf. Zeilen einer Seite, deren Ergebnis die Validierung nicht bestanden hat, bleiben bewusst unter der Schwelle — ein Wert, den wir nicht an der Seite bestätigen konnten, wird nie geraten.",
  "Uploaded catalogues": "Hochgeladene Kataloge",
  "No catalogue uploaded yet.": "Noch kein Katalog hochgeladen.",
  "{n} row": "{n} Zeile",
  "{n} rows": "{n} Zeilen",
  "Download original": "Original herunterladen",

  // Pricing (app/supplier/pricing/page.tsx)
  "What each of your products costs. A PDF catalogue carries no prices and the platform will not invent one, so a product arrives unpriced: listed and matchable, but not quotable to a hospital until you set something here. A price can be one figure at every quantity, or a ladder of volume breaks.":
    "Was jedes Ihrer Produkte kostet. Ein PDF-Katalog enthält keine Preise, und die Plattform erfindet keine; ein Produkt kommt daher ohne Preis an: gelistet und abgleichbar, aber einem Spital erst anbietbar, wenn Sie hier etwas festlegen. Ein Preis kann ein Betrag für jede Menge sein oder eine Staffel mit Mengenrabatten.",
  "Unpriced": "Ohne Preis",
  "{unpriced} of {total} products have no price. Hospitals can find and match them, but no saving is claimed and they cannot be ordered until you set one.":
    "{unpriced} von {total} Produkten haben keinen Preis. Spitäler können sie finden und abgleichen, aber es wird keine Einsparung ausgewiesen, und bestellt werden können sie erst, wenn Sie einen festlegen.",
  "{n} catalogue row": "{n} Katalogzeile",
  "{n} catalogue rows": "{n} Katalogzeilen",
  "no price yet": "noch kein Preis",
  "from your catalogue": "aus Ihrem Katalog",
  "set by you": "von Ihnen festgelegt",
  "every quantity": "jede Menge",

  // Product page (app/supplier/products/[id]/page.tsx)
  "In review": "In Prüfung",
  "This row is still in your review queue at {confidence} extraction confidence, below the bar of {threshold}. Confirm it on the":
    "Diese Zeile liegt mit {confidence} Extraktionskonfidenz noch in Ihrer Prüfliste, unter der Schwelle von {threshold}. Bestätigen Sie sie auf der",
  "catalogue page": "Katalogseite",
  "and it becomes a product hospitals can be matched against — then it can be priced and photographed here.":
    "und sie wird zu einem Produkt, mit dem Spitäler abgeglichen werden können — danach können Sie hier Preis und Foto hinterlegen.",
  "No price set. The product is listed and searchable, but no saving is claimed against it and a hospital cannot order it.":
    "Kein Preis festgelegt. Das Produkt ist gelistet und auffindbar, aber es wird keine Einsparung ausgewiesen, und ein Spital kann es nicht bestellen.",
  "Stated in the catalogue you uploaded.": "Aus dem von Ihnen hochgeladenen Katalog.",
  "Set by you.": "Von Ihnen festgelegt.",
  "per {uom}, by quantity ordered": "pro {uom}, nach Bestellmenge",
  "As extracted from your catalogue": "Wie aus Ihrem Katalog extrahiert",
  "Row read as": "Zeile gelesen als",
  "Columns": "Spalten",

  // Pictures and description (app/components/ProductEditor.tsx)
  "Confirm this row to give it a product page you can price and photograph.":
    "Bestätigen Sie diese Zeile, um eine Produktseite zu erhalten, auf der Sie Preis und Foto hinterlegen können.",
  "No picture yet": "Noch kein Bild",
  "shown": "angezeigt",
  "supplied by you": "von Ihnen geliefert",
  "from your catalogue, p.{page}": "aus Ihrem Katalog, S. {page}",
  "Remove this picture": "Dieses Bild entfernen",
  "Add your own photograph": "Eigenes Foto hinzufügen",
  "Uploading…": "Wird hochgeladen…",
  "Upload picture": "Bild hochladen",
  "What this article is for, and anything a buyer should know before switching to it.":
    "Wofür dieser Artikel gedacht ist und was ein Einkäufer vor dem Wechsel wissen sollte.",
  "Shown to hospitals on the product page. Extraction never fills this in — a catalogue describes a family, not a size.":
    "Wird Spitälern auf der Produktseite angezeigt. Die Extraktion füllt dieses Feld nie aus — ein Katalog beschreibt eine Produktfamilie, keine einzelne Grösse.",
  "Save description": "Beschreibung speichern",

  // Price ladder (app/components/TierEditor.tsx)
  "Edit pricing": "Preise bearbeiten",
  "Set pricing": "Preise festlegen",
  "One row is one price per {uom}, charged from its quantity upwards. Leave it at a single row for a flat price, or add rows for volume breaks — each one ends where the next begins.":
    "Eine Zeile ist ein Preis pro {uom}, gültig ab ihrer Menge aufwärts. Belassen Sie es bei einer Zeile für einen Einheitspreis, oder fügen Sie Zeilen für Mengenstaffeln hinzu — jede endet dort, wo die nächste beginnt.",
  "From (units)": "Ab (Einheiten)",
  "Unit price ({currency})": "Stückpreis ({currency})",
  "Remove this tier": "Diese Staffel entfernen",
  "Add a tier": "Staffel hinzufügen",
  "Two tiers start at the same quantity. Each one needs its own floor.":
    "Zwei Staffeln beginnen bei derselben Menge. Jede braucht ihre eigene Untergrenze.",
  "A price rises with volume here. That is allowed — but check it is what you mean, because a hospital ordering more would pay more per unit.":
    "Hier steigt ein Preis mit der Menge. Das ist zulässig — prüfen Sie aber, ob Sie das so meinen, denn ein Spital, das mehr bestellt, würde pro Einheit mehr bezahlen.",
  "Clear the price": "Preis entfernen",
  "Save pricing": "Preise speichern",
  "No price yet. Saving like this leaves the product listed and matchable, but it cannot be quoted or ordered.":
    "Noch kein Preis. So gespeichert bleibt das Produkt gelistet und abgleichbar, kann aber weder angeboten noch bestellt werden.",

  // Product details (app/components/IdentityEditor.tsx)
  "Edit details": "Angaben bearbeiten",
  "Hospitals will read this differently": "Spitäler werden das anders lesen",
  "Product details": "Produktangaben",
  "Check each point below is what you mean before saving.": "Prüfen Sie vor dem Speichern, ob jeder Punkt unten so gemeint ist.",
  "Correct what extraction read wrong. Every change is kept in the correction log with its old value.":
    "Korrigieren Sie, was die Extraktion falsch gelesen hat. Jede Änderung wird mit ihrem alten Wert im Korrekturprotokoll festgehalten.",
  "Unit — one price is per": "Einheit — ein Preis gilt pro",
  "Per pack": "Pro Packung",
  "This change affects what hospitals see — you will be shown how before it saves.":
    "Diese Änderung betrifft, was Spitäler sehen — vor dem Speichern wird Ihnen gezeigt, wie.",
  "These {n} changes affect what hospitals see — you will be shown how before it saves.":
    "Diese {n} Änderungen betreffen, was Spitäler sehen — vor dem Speichern wird Ihnen gezeigt, wie.",
  "Go back": "Zurück",
  "Save anyway": "Trotzdem speichern",
  "Review changes": "Änderungen prüfen",
  "{n} hospital line": "{n} Spitalposition",
  "{n} hospital lines": "{n} Spitalpositionen",
  "It is in front of {lines} today.": "Es liegt heute {lines} vor.",
  "It is in front of {lines} today, with {n} open order.": "Es liegt heute {lines} vor, mit {n} offenen Bestellung.",
  "It is in front of {lines} today, with {n} open orders.": "Es liegt heute {lines} vor, mit {n} offenen Bestellungen.",
  "Risk class MDR {from} → MDR {to}": "Risikoklasse MDR {from} → MDR {to}",
  "Switching to this becomes a clinical decision: new orders will need clinical sign-off before they can be approved.":
    "Der Wechsel zu diesem Produkt wird zu einem klinischen Entscheid: Neue Bestellungen brauchen vor der Freigabe eine klinische Zustimmung.",
  "Hospitals will no longer need clinical sign-off to switch to it.":
    "Spitäler brauchen für den Wechsel zu diesem Produkt keine klinische Zustimmung mehr.",
  "A lower class than your catalogue stated is the change a hospital will question first — make sure it matches your declaration of conformity.":
    "Eine tiefere Klasse als in Ihrem Katalog angegeben ist die Änderung, die ein Spital zuerst hinterfragt — stellen Sie sicher, dass sie Ihrer Konformitätserklärung entspricht.",
  "{lines} already chose it as a replacement; that analysis was made against MDR {cls} and will not re-run on its own.":
    "{lines} haben es bereits als Ersatz gewählt; diese Analyse wurde gegen MDR {cls} erstellt und läuft nicht von selbst neu.",
  "Orders already placed keep the sign-off route they were placed with.":
    "Bereits aufgegebene Bestellungen behalten den Freigabeweg, mit dem sie aufgegeben wurden.",
  "Unit “{from}” → “{to}”": "Einheit «{from}» → «{to}»",
  "Your prices are not converted. A hospital will read {price} per {to} where it read it per {from} — if one is not the same as the other, change the pricing as well.":
    "Ihre Preise werden nicht umgerechnet. Ein Spital liest dann {price} pro {to}, wo es bisher pro {from} las — ist das eine nicht dasselbe wie das andere, passen Sie auch die Preise an.",
  "the same price": "denselben Preis",
  "Any price you set will be read per {unit}.": "Jeder Preis, den Sie festlegen, gilt dann pro {unit}.",
  "Hospitals compare it against what they pay per unit today, so their savings shift with it.":
    "Spitäler vergleichen ihn mit dem, was sie heute pro Einheit bezahlen; ihre Einsparungen verschieben sich also mit.",
  "Pack {from} → {to} per pack": "Packung {from} → {to} pro Packung",
  "Hospitals read the pack beside the price and compare it with the pack they buy today — {to} where they expected {from} reads as a different article, and the switch analysis weighs it that way. The price per {unit} stays as it is.":
    "Spitäler lesen die Packung neben dem Preis und vergleichen sie mit der Packung, die sie heute kaufen — {to}, wo sie {from} erwarten, wirkt wie ein anderer Artikel, und die Wechselanalyse gewichtet es entsprechend. Der Preis pro {unit} bleibt, wie er ist.",
  "Article no. {from} → {to}": "Artikelnummer {from} → {to}",
  "Hospitals find your article by this number.": "Spitäler finden Ihren Artikel über diese Nummer.",
  "The {lines} already matched keep their link, but their article masters still quote {sku} — an upload using the old number will no longer be matched exactly, and has to be found by description instead.":
    "Die {lines}, die bereits zugeordnet sind, behalten ihre Verknüpfung, aber ihre Artikelstämme nennen noch {sku} — ein Upload mit der alten Nummer wird nicht mehr exakt zugeordnet und muss stattdessen über die Beschreibung gefunden werden.",
  "An article master quoting {sku} — an upload using the old number will no longer be matched exactly, and has to be found by description instead.":
    "Ein Artikelstamm mit {sku} — ein Upload mit der alten Nummer wird nicht mehr exakt zugeordnet und muss stattdessen über die Beschreibung gefunden werden.",
};

export default de;
