import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const DEFAULT_CONFIG = {
  transcriptsDir:
    "/Users/hansol/Library/Mobile Documents/iCloud~tech~median~Whisper/Documents/Transcripts",
  supabaseUrl: "https://mwwbqzdpnvnrvcdfxflh.supabase.co",
  supabaseAnonKey: "",
  email: "",
  password: "",
  pollSeconds: 20,
};

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const once = args.has("--once") || dryRun;
const statePath = ".watcher-state.json";
const configPath = "watcher.local.json";

const config = await loadConfig();
let watcherState = await loadWatcherState();
let accessToken = "";

if (!dryRun) {
  accessToken = await signIn();
  console.log("Signed in to Supabase.");
}

await scanAndImport();

if (!once) {
  console.log(`Watching ${config.transcriptsDir}`);
  console.log(`Polling every ${config.pollSeconds}s. Press Ctrl+C to stop.`);
  setInterval(scanAndImport, Math.max(5, Number(config.pollSeconds || 20)) * 1000);
}

async function loadConfig() {
  let localConfig = {};
  if (existsSync(configPath)) {
    localConfig = JSON.parse(await readFile(configPath, "utf8"));
  }
  const merged = {
    ...DEFAULT_CONFIG,
    ...localConfig,
  };
  merged.supabaseUrl = merged.supabaseUrl.replace(/\/$/, "");
  return merged;
}

async function loadWatcherState() {
  if (!existsSync(statePath)) return { imported: {} };
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return { imported: {} };
  }
}

async function saveWatcherState() {
  await writeFile(statePath, JSON.stringify(watcherState, null, 2));
}

async function scanAndImport() {
  try {
    const files = await listTranscriptFiles(config.transcriptsDir);
    let imported = 0;

    for (const filePath of files) {
      const meta = await stat(filePath);
      const fileKey = `${filePath}:${meta.mtimeMs}:${meta.size}`;
      if (watcherState.imported[fileKey]) continue;

      const text = (await readFile(filePath, "utf8")).trim();
      if (!text) continue;

      const row = makeRawInboxRow(filePath, text);

      if (dryRun) {
        console.log(JSON.stringify({ filePath, row }, null, 2));
        imported += 1;
        continue;
      } else {
        await insertRawInbox(row);
        console.log(`Imported ${basename(filePath)}`);
      }

      watcherState.imported[fileKey] = {
        importedAt: new Date().toISOString(),
        filePath,
        hash: hashText(text),
      };
      imported += 1;
    }

    if (imported > 0 && !dryRun) await saveWatcherState();
    if (dryRun && imported === 0) console.log("No new transcript files found.");
  } catch (error) {
    console.error(`Watcher error: ${error.message}`);
  }
}

async function listTranscriptFiles(root) {
  const files = [];
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTranscriptFiles(fullPath)));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".txt") {
      if (entry.name.toLowerCase() !== "readme.txt") files.push(fullPath);
    }
  }

  return files.sort();
}

function makeRawInboxRow(filePath, text) {
  const fileName = basename(filePath);
  const dateMatch = filePath.match(/(\d{4}-\d{2}-\d{2})/);
  const timeMatch = fileName.match(/(\d{2})-(\d{2})-(\d{2})/);
  const fullHint = `${fileName} ${text}`;
  const visitType = /초진|신규|initial/i.test(fullHint) ? "초진" : "재진";
  const patientHint = inferPatientHint(fullHint);

  return {
    local_id: hashText(filePath),
    type: "transcript",
    file_name: fileName,
    recorded_date: dateMatch?.[1] || new Date().toISOString().slice(0, 10),
    recorded_time: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}` : null,
    patient_hint: patientHint,
    visit_type: visitType,
    raw_text: text,
    corrected_text: text,
    status: "new",
  };
}

function inferPatientHint(value) {
  const cleaned = value
    .replace(/\.txt$/i, "")
    .replace(/\d{2}-\d{2}-\d{2}/g, " ")
    .replace(/테스트|녹음|기록|오른쪽|왼쪽|무릎|허리|목|어깨|통증|계단/g, " ");
  const match = cleaned.match(/([가-힣A-Za-z]{2,12})(?:\s|-)*(?:님|초진|재진|신규)/);
  return match?.[1] || "";
}

function hashText(text) {
  return createHash("sha1").update(text).digest("hex");
}

async function signIn() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("watcher.local.json에 supabaseUrl과 supabaseAnonKey가 필요합니다.");
  }
  if (!config.email || !config.password) {
    throw new Error("watcher.local.json에 email과 password가 필요합니다.");
  }

  const data = await supabaseFetch("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: {
      email: config.email,
      password: config.password,
    },
    auth: false,
  });
  return data.access_token;
}

async function insertRawInbox(row) {
  await supabaseFetch("/rest/v1/raw_inbox", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: row,
  });
}

async function supabaseFetch(path, options = {}) {
  const headers = {
    apikey: config.supabaseAnonKey,
    "Content-Type": "application/json",
    ...(options.auth === false ? {} : { Authorization: `Bearer ${accessToken}` }),
    ...(options.headers || {}),
  };

  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? safeJSON(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error_description || data?.error || response.statusText);
  }
  return data;
}

function safeJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
