import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import reference from "./mail-reference.json";
import type { EmailScenario } from "./types";

const containerName = process.env.AZURE_STORAGE_CONTAINER?.trim() || "exam-data";
const emailBlobName = "settings/email-scenario.json";
let containerPromise: Promise<ContainerClient> | null = null;

function connectionString() {
  return process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
}

async function azureContainer(): Promise<ContainerClient | null> {
  const configured = connectionString();
  if (!configured) return null;
  if (!containerPromise) {
    containerPromise = (async () => {
      const container = BlobServiceClient.fromConnectionString(configured).getContainerClient(containerName);
      await container.createIfNotExists();
      return container;
    })();
  }
  return containerPromise;
}

function localSettingsPath(fileName: string) {
  return path.join(process.cwd(), "data", "settings", fileName);
}

async function readJson<T>(blobName: string, localFileName: string): Promise<T | null> {
  const container = await azureContainer();
  if (container) {
    const client = container.getBlobClient(blobName);
    if (!(await client.exists())) return null;
    const buffer = await client.downloadToBuffer();
    return JSON.parse(buffer.toString("utf8")) as T;
  }

  try {
    return JSON.parse(await fs.readFile(localSettingsPath(localFileName), "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(blobName: string, localFileName: string, value: unknown) {
  const content = JSON.stringify(value, null, 2);
  const container = await azureContainer();
  if (container) {
    await container.getBlockBlobClient(blobName).uploadData(Buffer.from(content, "utf8"), {
      blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
    });
    return;
  }

  const target = localSettingsPath(localFileName);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

export function emailScenarioOptions() { return reference.scenarios; }
export async function getEmailExamContent(): Promise<EmailScenario> {
  return (await readJson<EmailScenario>(emailBlobName, "email-scenario.json")) ?? reference.scenarios[0];
}
export async function saveEmailExamContent(value: EmailScenario): Promise<EmailScenario> {
  const preset = reference.scenarios.find(item => item.id === value.id && item.enabled);
  if (!preset) throw new Error("この問題は採点基準の確認待ち、または存在しません。");
  if (![value.title, value.situation, value.request].every(v => typeof v === "string" && v.trim())) throw new Error("問題文をすべて入力してください。");
  const content = { ...preset, title: value.title.trim(), situation: value.situation.trim(), request: value.request.trim(), version: randomUUID() };
  await writeJson(`settings/scenarios/${content.version}.json`, `scenario-${content.version}.json`, content);
  await writeJson(emailBlobName, "email-scenario.json", content);
  return content;
}
export async function getSubmittedScenario(id: string, version: string): Promise<EmailScenario> {
  const preset = reference.scenarios.find(s => s.id === id && s.enabled);
  if (!preset) throw new Error("この問題は利用できません。");
  if (version === preset.version) return preset;
  if (!/^[a-f0-9-]{36}$/.test(version)) throw new Error("問題のバージョンが正しくありません。");
  const value = await readJson<EmailScenario>(`settings/scenarios/${version}.json`, `scenario-${version}.json`);
  if (!value || value.id !== id) throw new Error("出題内容を確認できません。試験官に申し出てください。");
  return value;
}
