import type { RequestHandler } from './$types';
import { requireAuth } from '#lib/server/auth/permissions.js';
import { loadInvoiceForDownload, renderInvoicePdf } from '#lib/server/services/invoices.js';

export const GET: RequestHandler = async ({ params, locals }) => {
  requireAuth(locals.user);

  const invoice = await loadInvoiceForDownload(params.number, locals.user);
  const pdf = await renderInvoicePdf(invoice);
  const filename = `mge-tf-${invoice.number}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
};
