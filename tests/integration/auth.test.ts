import { describe, expect, it } from 'vitest';
import { col } from '@/lib/db';
import { consumeMagicLink, requestMagicLink } from '@/lib/auth/magic-link';
import { signMagicToken, signSession, verifySession } from '@/lib/auth/jwt';
import { mailTo, setupTestDb } from './helpers';

setupTestDb();

const tokenFrom = async (email: string) => {
  const mails = await mailTo(email);
  const text = mails.at(-1)!.text;
  return decodeURIComponent(/token=([^\s]+)/.exec(text)![1]);
};

describe('magic link', () => {
  it('flujo completo: solicita, consume una vez, crea usuario con el rol correcto', async () => {
    await requestMagicLink('nuevo@test.local', '1.1.1.1');
    const token = await tokenFrom('nuevo@test.local');
    const first = await consumeMagicLink(token);
    expect('user' in first && first.user.role).toBe('investor');
    expect(await consumeMagicLink(token)).toEqual({ error: 'used' });
  });

  it('los correos de ADMIN_EMAILS reciben rol admin', async () => {
    await requestMagicLink('admin@test.local', '1.1.1.2');
    const res = await consumeMagicLink(await tokenFrom('admin@test.local'));
    expect('user' in res && res.user.role).toBe('admin');
  });

  it('token inválido o manipulado → error', async () => {
    expect(await consumeMagicLink('basura')).toEqual({ error: 'invalid' });
    await requestMagicLink('manip@test.local', '1.1.1.3');
    const token = await tokenFrom('manip@test.local');
    expect(await consumeMagicLink(token.slice(0, -4) + 'AAAA')).toEqual({ error: 'invalid' });
  });

  it('token expirado → error expired', async () => {
    await requestMagicLink('exp@test.local', '1.1.1.4');
    const token = await tokenFrom('exp@test.local');
    await (await col('magicLinks')).updateMany({ email: 'exp@test.local' }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await consumeMagicLink(token)).toEqual({ error: 'expired' });
  });

  it('un JWT firmado pero sin jti registrado no sirve', async () => {
    const { token } = await signMagicToken('fantasma@test.local');
    expect(await consumeMagicLink(token)).toEqual({ error: 'invalid' });
  });

  it('rate limit por correo', async () => {
    for (let i = 0; i < 3; i++) await requestMagicLink('rl@test.local', `2.2.2.${i}`);
    await expect(requestMagicLink('rl@test.local', '2.2.2.9')).rejects.toMatchObject({ status: 429 });
  });

  it('el JWT de sesión conserva sub y rol; uno ajeno se rechaza', async () => {
    const jwt = await signSession({ sub: 'abc', role: 'admin', email: 'a@b.c' });
    expect(await verifySession(jwt)).toEqual({ sub: 'abc', role: 'admin', email: 'a@b.c' });
    expect(await verifySession(jwt + 'x')).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
    const { token } = await signMagicToken('x@y.z');
    expect(await verifySession(token)).toBeNull(); // un magic token no es una sesión
  });
});
