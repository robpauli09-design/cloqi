import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { isConfigured } from '@/lib/integrations';
import { Onboarding } from './Onboarding';

export const metadata: Metadata = { title: 'Willkommen' };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboarded) redirect('/dashboard');
  return <Onboarding googleReady={isConfigured('google')} outlookReady={isConfigured('outlook')} />;
}
