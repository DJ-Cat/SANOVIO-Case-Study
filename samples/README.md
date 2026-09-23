# Sample upload files

The platform ships empty. These are files to upload through the portals — nothing here is
loaded automatically.

| File | Upload in | Sign in as | Contents |
|---|---|---|---|
| `../Entwicklungsherausforderungen v01.xlsx` | Hospital → Upload demand | — | The supplied demand workbook, 10 real article rows |
| `../Produktkatalog.pdf` | Supplier → Upload catalogue | `org_bbraun` (default) | Real B. Braun catalogue — Injekt, Omnifix, Sterican |
| `../Produktkatalog 02.pdf` | Supplier → Upload catalogue | `org_bd` | Real BD catalogue — Microlance, Plastipak, Discardit |
| `hospital-hochrisiko-bedarf.csv` | Hospital → Upload demand | — | **Synthetic.** Class IIb and III articles, so the clinical gate has something to act on |
| `manufacturer-medtronic.csv` | Supplier → Upload catalogue | `org_medtronic` | **Synthetic.** Class III implants with stated prices |
| `manufacturer-smith-nephew.csv` | Supplier → Upload catalogue | `org_smithnephew` | **Synthetic.** Competing Class III implants |
| `manufacturer-bd-pumpsets.csv` | Supplier → Upload catalogue | `org_bd` | **Synthetic.** Class IIb pump sets |
| `manufacturer-bbraun-pumpsets.csv` | Supplier → Upload catalogue | `org_bbraun` | **Synthetic.** Competing Class IIb pump sets |

The supplier portal is one manufacturer's workspace, so a catalogue is filed against whoever is
signed in. Switch with `/supplier/as/<orgId>` before uploading — the **Sign in as** column above
gives the id for each file.

The two PDFs and the xlsx are the real case-study files. Everything marked synthetic exists
because the supplied files contain only Class I and IIa articles and carry no prices — without
them the risk-weighted gate and the pooling mechanic have nothing to demonstrate.
