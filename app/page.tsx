import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/login'); // proxy.ts redirige antes según sesión; esto es el respaldo.
}
