import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => {
  const destination = `/matches/${encodeURIComponent(params.id)}${url.search}`;
  throw redirect(301, destination);
};
