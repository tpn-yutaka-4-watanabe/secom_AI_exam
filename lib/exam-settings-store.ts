import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { receivedEmail as defaultReceivedEmail } from "./exam-content";
import type { EmailExamContent, ReceivedEmail, VideoPlaybackState } from "./types";

const containerName = process.env.AZURE_STORAGE_CONTAINER?.trim() || "exam-data";
const emailBlobName = "settings/email-exam.json";
const playbackBlobName = "settings/video-playback.json";
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

function cleanReceivedEmail(value: ReceivedEmail): ReceivedEmail {
  return {
    from: value.from.trim(),
    to: value.to.trim(),
    date: value.date.trim(),
    subject: value.subject.trim(),
    body: value.body.trim(),
  };
}

export async function getEmailExamContent(): Promise<EmailExamContent> {
  return (await readJson<EmailExamContent>(emailBlobName, "email-exam.json")) ?? defaultReceivedEmail;
}

export async function saveEmailExamContent(value: ReceivedEmail): Promise<EmailExamContent> {
  const content = { ...cleanReceivedEmail(value), updatedAt: new Date().toISOString() };
  await writeJson(emailBlobName, "email-exam.json", content);
  return content;
}

function waitingPlaybackState(): VideoPlaybackState {
  return { runId: randomUUID(), startedAt: null, updatedAt: new Date().toISOString() };
}

let playbackCache: { value: VideoPlaybackState; loadedAt: number } | null = null;
let playbackLoadPromise: Promise<VideoPlaybackState> | null = null;

export async function getVideoPlaybackState(): Promise<VideoPlaybackState> {
  if (playbackCache && Date.now() - playbackCache.loadedAt < 750) return playbackCache.value;
  if (!playbackLoadPromise) {
    playbackLoadPromise = (async () => {
      const value = (await readJson<VideoPlaybackState>(playbackBlobName, "video-playback.json")) ?? waitingPlaybackState();
      playbackCache = { value, loadedAt: Date.now() };
      return value;
    })();
  }
  try {
    return await playbackLoadPromise;
  } finally {
    playbackLoadPromise = null;
  }
}

export async function startVideoPlayback(): Promise<VideoPlaybackState> {
  const value = { runId: randomUUID(), startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await writeJson(playbackBlobName, "video-playback.json", value);
  playbackCache = { value, loadedAt: Date.now() };
  return value;
}

export async function resetVideoPlayback(): Promise<VideoPlaybackState> {
  const value = waitingPlaybackState();
  await writeJson(playbackBlobName, "video-playback.json", value);
  playbackCache = { value, loadedAt: Date.now() };
  return value;
}
