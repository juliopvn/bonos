import { ObjectId } from 'mongodb';
import { requirePageRole } from './guards';
import { findUserById } from '../repositories/users';
import { countUnreadAlerts } from '../repositories/alerts';
import type { Role } from '../types';
import { redirect } from 'next/navigation';

/** Datos comunes de los layouts autenticados (sesión validada en servidor). */
export async function loadShellData(role: Role) {
  const session = await requirePageRole(role);
  const user = await findUserById(session.sub);
  if (!user) redirect('/login');
  const unread = role === 'investor' ? await countUnreadAlerts(new ObjectId(session.sub)) : 0;
  return {
    session,
    user: { id: session.sub, email: user.email, name: user.name, role: user.role },
    unread,
  };
}
