/**
 * Seed the platform with organisations and users — nothing else.
 *
 * No catalogue and no demand file is preloaded: every article in the system
 * arrives through an upload in the portals. Run this once to get a usable
 * empty platform, then upload a supplier catalogue and a hospital demand file.
 */
import { resetDb, id, nowIso, tx } from "../lib/db.ts";
import { adapterName } from "../lib/ai/index.ts";

const HOSPITALS = [
  { id: "org_h1", name: "Universitätsspital Limmattal", country: "CH", city: "Zürich" },
  { id: "org_h2", name: "Kantonsspital Seefeld", country: "CH", city: "Zürich" },
  { id: "org_h3", name: "Klinikum Nordstadt", country: "DE", city: "Hannover" },
  { id: "org_h4", name: "Universitätsklinikum Rheintal", country: "CH", city: "Chur" },
  { id: "org_h5", name: "Spital Oberland", country: "CH", city: "Thun" },
];

const MANUFACTURERS = [
  { id: "org_bbraun", name: "B. Braun", country: "DE", city: "Melsungen" },
  { id: "org_bd", name: "BD (Becton Dickinson)", country: "DE", city: "Heidelberg" },
  { id: "org_medline", name: "Medline", country: "DE", city: "Kleinostheim" },
  { id: "org_hartmann", name: "Paul Hartmann", country: "DE", city: "Heidenheim" },
  { id: "org_schuelke", name: "Schülke & Mayr", country: "DE", city: "Norderstedt" },
  { id: "org_ansell", name: "Ansell", country: "BE", city: "Brüssel" },
  { id: "org_sarstedt", name: "Sarstedt", country: "DE", city: "Nümbrecht" },
  { id: "org_medtronic", name: "Medtronic", country: "IE", city: "Dublin" },
  { id: "org_smithnephew", name: "Smith+Nephew", country: "GB", city: "Watford" },
];

function main() {
  console.log(`[seed] adapters: ${adapterName()}`);
  const conn = resetDb();

  const insOrg = conn.prepare(
    `INSERT INTO organizations (id,name,type,country,city,channel) VALUES (?,?,?,?,?,?)`);
  const insUser = conn.prepare(
    `INSERT INTO users (id,name,email,role,organization_id) VALUES (?,?,?,?,?)`);

  tx(() => {
    insOrg.run("org_sanovio", "SANOVIO", "sanovio", "DE", "München", null);
    for (const h of HOSPITALS) insOrg.run(h.id, h.name, "hospital", h.country, h.city, null);
    for (const m of MANUFACTURERS) insOrg.run(m.id, m.name, "supplier", m.country, m.city, "manufacturer");
    // The distributor the platform displaces. Present so a hospital's current
    // source has a name, but never a source of direct offers.
    insOrg.run("org_dist", "Medifach Handels AG", "supplier", "CH", "Basel", "distributor");

    insUser.run("usr_buyer", "Andrea Vogt", "a.vogt@limmattal.example", "hospital_buyer", "org_h1");
    insUser.run("usr_appr", "Daniel Roth", "d.roth@limmattal.example", "hospital_approver", "org_h1");
    insUser.run("usr_clin", "Dr. Sofia Marti", "s.marti@limmattal.example", "hospital_clinical", "org_h1");
    insUser.run("usr_admin", "SANOVIO Ops", "ops@sanovio.example", "sanovio_admin", "org_sanovio");
    for (const m of MANUFACTURERS) {
      insUser.run(`usr_${m.id}`, `${m.name} Sales`,
        `sales@${m.id.replace("org_", "")}.example`, "supplier_user", m.id);
    }
  });

  console.log(`[seed] ${HOSPITALS.length} hospitals, ${MANUFACTURERS.length} manufacturers, 1 distributor`);
  console.log("[seed] no catalogue or demand data preloaded — upload it in the portals.");
  conn.close();
}

main();
