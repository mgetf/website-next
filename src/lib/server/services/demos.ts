/**
 * Demo Service Layer
 * Handles demo upload, retrieval, and reporting operations
 */

import { prisma } from '$lib/server/db';
import { uploadToR2 } from '$lib/server/utils/r2Upload';
import { DemoStatus } from '$prisma/client.js';
import fs from 'fs';

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

  const playerExists = await prisma.user.findUnique({
    where: { steamId: playerSteamId },
  });

  if (!playerExists) {
    await prisma.user.create({
      data: {
        steamId: playerSteamId,
        steamUsername: 'Unknown',
        steamAvatar: '',
      },
    });
  }

  const demo = await prisma.demo.create({
    data: {
      file: demoUrl,
      playerSteamId,
      submittedBy,
      matchId,
      description: description || null,
      title: title || null,
    },
  });

  return demo;
}

export async function getDemoById(id: number) {
  const demo = await prisma.demo.findUnique({
    where: { id },
    include: {
      player: true,
      submitter: true,
      match: {
        include: {
          homeTeam: {
            include: {
              division: true,
              region: true,
            },
          },
          awayTeam: {
            include: {
              division: true,
              region: true,
            },
          },
        },
      },
      tournament: true,
      fightNightMatchup: true,
      reports: {
        include: {
          reporter: true,
          admin: true,
        },
        orderBy: {
          reportedAt: 'desc',
        },
      },
    },
  });

  return demo;
}

export async function reportDemo(demoId: number, reportedBy: string, description: string) {
  if (!description || description.length > 1000 || /<|>/.test(description)) {
    throw new Error('Invalid description. Must be 1-1000 characters without HTML tags.');
  }

  const existingReport = await prisma.demoReport.findFirst({
    where: {
      demoId,
      reportedBy,
      status: DemoStatus.REVIEW,
    },
  });

  if (existingReport) {
    throw new Error('You have already submitted a pending report for this demo.');
  }

  const report = await prisma.demoReport.create({
    data: {
      demoId,
      reportedBy,
      status: DemoStatus.REVIEW,
      description,
    },
  });

  return report;
}

export async function getDemoReports(demoId: number) {
  const reports = await prisma.demoReport.findMany({
    where: { demoId },
    include: {
      reporter: true,
      admin: true,
    },
    orderBy: {
      reportedAt: 'desc',
    },
  });

  return reports;
}

export async function getUserDemoReports(demoId: number, userSteamId: string) {
  const reports = await prisma.demoReport.findMany({
    where: {
      demoId,
      reportedBy: userSteamId,
    },
    orderBy: {
      reportedAt: 'desc',
    },
  });

  return reports;
}
