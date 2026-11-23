import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { lastPath } from '@/lib/last-path';

export default async function Home() {
  const user = await currentUser();
  redirect(!user ? '/login' : user.onboarded ? await lastPath() : '/onboarding');
}
