import { Redirect } from 'expo-router';

// Onboarding (RN-10) will redirect to /onboarding here until it is completed.
export default function Index() {
  return <Redirect href="/bakes" />;
}
