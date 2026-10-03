import { ObjectId } from 'mongodb';
import { requireRole } from '@/lib/auth/guards';
import { badRequest, ok, route } from '@/lib/http';
import { uploadDocument } from '@/lib/services/documents';
import { documentKind, objectId } from '@/lib/validation';

export const POST = route(async (req) => {
  const s = await requireRole('admin');
  const form = await req.formData().catch(() => {
    throw badRequest('Se esperaba multipart/form-data');
  });
  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('Adjunta un archivo en el campo "file"');
  const bondId = objectId.parse(form.get('bondId'));
  const kind = documentKind.parse(form.get('kind'));
  return ok(await uploadDocument(new ObjectId(s.sub), { bondId, kind, file }), { status: 201 });
});
