import type { RequestHandler } from './$types';
import { publicGet } from '#lib/server/api/publicGet.js';
import { listPublicFormats } from '#lib/server/services/publicLeague.js';

export const GET: RequestHandler = ({ getClientAddress }) =>
  publicGet(getClientAddress, () => listPublicFormats());
