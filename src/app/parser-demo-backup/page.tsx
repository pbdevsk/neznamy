import { AdvancedParserDemo } from '@/components/advanced-parser-demo-backup';

export default function ParserDemoBackupPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdvancedParserDemo />
    </div>
  );
}

export const metadata = {
  title: 'Parser Demo Backup - Register neznámych vlastníkov',
  description: 'Záloha pôvodného demo parsera pre extrakciu štruktúrovaných údajov z textových záznamov'
};
