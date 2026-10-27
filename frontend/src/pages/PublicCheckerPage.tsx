import { Link } from 'react-router-dom';
import { Api } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { PublicPage } from '../components/PublicShell';
import SymptomChecker from '../components/SymptomChecker';
import { ErrorState, Spinner } from '../components/ui';
import { useAsync } from '../lib/useAsync';

export default function PublicCheckerPage() {
  const { user } = useAuth();
  const lib = useAsync(() => Api.publicLibrary(), []);
  return (
    <PublicPage eyebrow="Free · no sign-in · nothing is stored" title="Pig & poultry symptom checker"
      subtitle="Select the signs you see in your animals. The checker compares them with published veterinary descriptions, explains every match and tells you when a disease must be reported.">
      <div className="rounded-3xl border border-stone-200 bg-white/90 p-5 shadow-lift backdrop-blur sm:p-8">
        {lib.loading ? <Spinner /> : lib.error ? <ErrorState error={lib.error} onRetry={lib.reload} /> : <SymptomChecker library={lib.data!} mode="public" />}
      </div>
      <p className="mt-6 text-center text-sm text-stone-500">
        {user ? <>Want to save checks to a farm's records? <Link to="/symptom-checker" className="font-medium text-brand-700 hover:underline">Use the checker in your dashboard</Link>.</>
          : <>Farmers and veterinarians can save checks to farm records after <Link to="/login" className="font-medium text-brand-700 hover:underline">signing in</Link>.</>}
      </p>
    </PublicPage>
  );
}
