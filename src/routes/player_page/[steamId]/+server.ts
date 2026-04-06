import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => {
  const destination = `/users/${encodeURIComponent(params.steamId)}${url.search}`;
  throw redirect(301, destination);
};
