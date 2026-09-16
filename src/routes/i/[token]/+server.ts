import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
  throw redirect(303, `/teams/join?token=${encodeURIComponent(params.token)}`);
};
