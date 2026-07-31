/**
 * Demo Service Layer
 * Handles demo upload, retrieval, and reporting operations
 */

import { uploadToR2 } from '$lib/server/utils/r2Upload';
import fs from 'fs';
import { DemoStatus } from '$lib/types/enums';

interface UploadDemoData {
  file: {
    filepath: string;
    originalFilename: string;
    size: number;
  };
  playerSteamId: string;
  submittedBy: string;
  matchId: number;
  description?: string;
  title?: string;
}

export async function uploadDemo(data: UploadDemoData) {
  const { file, playerSteamId, submittedBy, matchId, description, title } = data;

  const fileExtension = file.originalFilename.split('.').pop()?.toLowerCase();
  if (fileExtension !== 'dem') {
    throw new Error('Invalid file type. Only .dem files are allowed.');
  }

  const maxSize = 200 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('File too large. Maximum size is 200MB.');
  }

  const uniqueFileName = `match-demo/${Date.now()}-${file.originalFilename}`;
  const demoUrl = await uploadToR2(file.filepath, uniqueFileName);

  if (!demoUrl) {
    throw new Error('Failed to upload demo to storage');
  }

  try {
    fs.unlinkSync(file.filepath);
  } catch (err) {
    console.error('Failed to delete temp file:', err);
  }

  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createDemosClient, createDemo, nextDemoId } = await import('$lib/server/rama/demos');
    const demoId = nextDemoId();
    const ack = await createDemo(createDemosClient(ramaClientOpts()), {
      demoId,
      matchId: String(matchId),
      playerSteamId,
      submittedBy,
      file: demoUrl,
      title: title || '',
      description: description || '',
    });
    if (!ack.ok) {
      throw new Error(ack.error || 'Failed to create demo in Rama');
    }
    return {
      id: Number(demoId),
      file: demoUrl,
      playerSteamId,
      submittedBy,
      matchId,
      description: description || null,
      title: title || null,
      submittedAt: new Date(),
    };
  }
  throw new Error('uploadDemo requires DATA_BACKEND=rama');
}

export async function reportDemo(demoId: number, reportedBy: string, description: string) {
  if (!description || description.length > 1000 || /<|>/.test(description)) {
    throw new Error('Invalid description. Must be 1-1000 characters without HTML tags.');
  }

  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const {
      createDemosClient,
      reportDemo: ramaReportDemo,
      getReportIdsForDemo,
      getDemoReport,
      nextReportId,
    } = await import('$lib/server/rama/demos');
    const client = createDemosClient(ramaClientOpts());
    const existingIds = await getReportIdsForDemo(client, String(demoId));
    for (const rid of existingIds) {
      const existing = await getDemoReport(client, rid);
      if (existing?.reportedBy === reportedBy && existing.status === 'REVIEW') {
        throw new Error('You have already submitted a pending report for this demo.');
      }
    }
    const reportId = nextReportId();
    const ack = await ramaReportDemo(client, {
      reportId,
      demoId: String(demoId),
      reportedBy,
      description,
    });
    if (!ack.ok) {
      throw new Error(ack.error || 'Failed to report demo');
    }
    return {
      id: Number(reportId),
      demoId,
      reportedBy,
      status: DemoStatus.REVIEW,
      description,
      reportedAt: new Date(),
    };
  }
  throw new Error('reportDemo requires DATA_BACKEND=rama');
}

export async function getUserDemoReports(demoId: number, userSteamId: string) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createDemosClient, getReportIdsForDemo, getDemoReport } =
      await import('$lib/server/rama/demos');
    const client = createDemosClient(ramaClientOpts());
    const ids = await getReportIdsForDemo(client, String(demoId));
    const reports = [];
    for (const rid of ids) {
      const report = await getDemoReport(client, rid);
      if (!report || report.reportedBy !== userSteamId) continue;
      reports.push({
        id: Number(rid),
        demoId,
        reportedBy: report.reportedBy,
        status: report.status as DemoStatus,
        description: report.description,
        adminComments: report.adminComments || null,
        adminId: report.adminId || null,
        reportedAt: report.reportedAt ? new Date(report.reportedAt) : new Date(),
      });
    }
    reports.sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
    return reports;
  }
  throw new Error('getUserDemoReports requires DATA_BACKEND=rama');
}
