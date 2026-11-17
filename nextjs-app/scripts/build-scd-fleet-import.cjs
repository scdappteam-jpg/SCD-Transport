const fs = require("fs");
const crypto = require("crypto");

const [inputPath, outputPath, credentialPath] = process.argv.slice(2);
if (!inputPath || !outputPath || !credentialPath) {
    throw new Error("Usage: node build-scd-fleet-import.cjs contacts.json fleet.json credentials.json");
}

const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const contacts = payload.records || payload.contacts || [];
const source = contacts.filter(item => item.sourceSheet === "SCD" && /ทะเบียน|รถ\s*(?:4|6)\s*ล้อ|เทลเลอร์|พ่วง/.test([item.organization,item.name,item.role,item.note].join("; ")));
const titleName = /;\s*((?:นาย|นางสาว|น\.\u0e2a\.|\u0e19าง)\s*[^;]+)/;
const platePattern = /ทะเบียน(?:รถ)?\s*([^;]+?)(?=\s*(?:รถ|รลเทลเลอร์|4\s*ล้อ|6\s*ล้อ|เทลเลอร์|ค่ะ|$))/;

function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function vehicleType(note) {
    if (/เทลเลอร์/.test(note)) return "Trailer";
    if (/6\s*ล้อ\s*พ่วง/.test(note)) return "6-wheel + trailer";
    if (/6\s*ล้อ/.test(note)) return "6-wheel";
    if (/4\s*ล้อ/.test(note)) return "4-wheel";
    return "Truck";
}
function password() {
    return `SCD@${crypto.randomBytes(9).toString("base64url")}9a`;
}

let sequence = 0;
const credentials = [];
let existingCredentials = [];
try { existingCredentials = JSON.parse(fs.readFileSync(credentialPath, "utf8")).credentials || []; } catch {}
const passwordByName = new Map(existingCredentials.map(item => [clean(item.name).replace(/\s+/g, ""), item.temporaryPassword]));
const records = source.map(item => {
    const note = clean([item.organization,item.name,item.role,item.note].filter(Boolean).join("; "));
    const name = /^(?:นาย|นางสาว|น\.\u0e2a\.|\u0e19าง)\s*/.test(clean(item.name)) ? clean(item.name) : clean(note.match(titleName)?.[1]);
    const plate = clean(note.match(platePattern)?.[1]).replace(/\s+/g, "");
    if (!plate) throw new Error(`Cannot parse plate at SCD row ${item.sourceRow}: ${note}`);
    const [primaryPlate, trailerPlate = ""] = plate.split("+", 2);
    const record = {
        employeeCode: "", name, phone: clean(item.phone), vehiclePlate: plate,
        primaryPlate, trailerPlate, vehicleType: vehicleType(note),
        organization: clean(item.organization), route: clean(item.role),
        sourceSheet: "SCD", sourceRow: item.sourceRow
    };
    if (name) {
        sequence += 1;
        record.employeeCode = `DRV${String(sequence).padStart(3, "0")}`;
        record.temporaryPassword = passwordByName.get(name.replace(/\s+/g, "")) || password();
        if (name.replace(/\s+/g, "") === "นายสมพงษ์พิมพ์โพธิ์") record.matchName = "นายสมพงษ์ พิมโพธิ์";
        credentials.push({ employeeCode: record.employeeCode, name, temporaryPassword: record.temporaryPassword });
    }
    return record;
});

const vehicles = new Set(records.map(item => item.vehiclePlate));
const out = { source: payload.source || inputPath, generatedAt: new Date().toISOString(), recordCount: records.length, driverCount: credentials.length, uniqueVehicleCount: vehicles.size, records };
fs.writeFileSync(outputPath, JSON.stringify(out, null, 2), "utf8");
fs.writeFileSync(credentialPath, JSON.stringify({ generatedAt: out.generatedAt, credentials }, null, 2), "utf8");
console.log(JSON.stringify({ recordCount: records.length, driverCount: credentials.length, uniqueVehicleCount: vehicles.size, outputPath, credentialPath }));
