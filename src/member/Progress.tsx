import { useStore } from '../lib/store';
import { Card } from '../components/ui';
import { MemberProgress } from '../components/MemberProgress';

export default function MemberProgressPage() {
  const { currentMember: m } = useStore();
  if (!m) return null;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My progress</h1>
        <p className="mt-1 text-sm text-zinc-400">Log your weigh-ins to track your weight and BMI over time.</p>
      </div>
      <Card className="p-5">
        <MemberProgress member={m} />
      </Card>
    </div>
  );
}
