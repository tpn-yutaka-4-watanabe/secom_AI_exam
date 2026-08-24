import { promises as fs } from "node:fs";
import path from "node:path";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import type { SubmissionRecord } from "./types";

const containerName = process.env.AZURE_STORAGE_CONTAINER?.trim() || "exam-data";

function connectionString() {
  return process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
}

async function azureContainer(): Promise<ContainerClient | null> {
  const configured = connectionString();
  if (!configured) return null;
  const container = BlobServiceClient.fromConnectionString(configured).getContainerClient(containerName);
  await container.createIfNotExists();
  return container;
}

function localRecordPath(id: string) {
  return path.join(process.cwd(), "data", "submissions", id, "record.json");
}

async function saveLocal(record: SubmissionRecord) {
  const target = localRecordPath(record.id);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(record, null, 2), "utf8");
}

async function saveAzure(container: ContainerClient, record: SubmissionRecord) {
  const name = `submissions/${record.id}/record.json`;
  const content = JSON.stringify(record, null, 2);
  await container.getBlockBlobClient(name).uploadData(Buffer.from(content, "utf8"), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}

export async function saveSubmission(record: SubmissionRecord) {
  const container = await azureContainer();
  if (container) await saveAzure(container, record);
  else await saveLocal(record);
}

async function listLocal(): Promise<SubmissionRecord[]> {
  const root = path.join(process.cwd(), "data", "submissions");
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const records = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      try {
        return JSON.parse(await fs.readFile(path.join(root, entry.name, "record.json"), "utf8")) as SubmissionRecord;
      } catch {
        return null;
      }
    }));
    return records.filter((record): record is SubmissionRecord => Boolean(record));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function listAzure(container: ContainerClient): Promise<SubmissionRecord[]> {
  const records: SubmissionRecord[] = [];
  for await (const blob of container.listBlobsFlat({ prefix: "submissions/" })) {
    if (!blob.name.endsWith("/record.json")) continue;
    const buffer = await container.getBlobClient(blob.name).downloadToBuffer();
    records.push(JSON.parse(buffer.toString("utf8")) as SubmissionRecord);
  }
  return records;
}

export async function listSubmissions() {
  const container = await azureContainer();
  const records = container ? await listAzure(container) : await listLocal();
  return records.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function storageMode() {
  return connectionString() ? "azure-blob" : "local-file";
}
