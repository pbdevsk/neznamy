import { AdvancedParserDemo } from '@/components/advanced-parser-demo';

export default function ParserDemoPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdvancedParserDemo />
    </div>
  );
}

export const metadata = {
  title: 'Bulk CSV Parser - Register neznámych vlastníkov',
  description: 'Bulk CSV analyzer pre spracovanie veľkých množstiev dát s pokročilým parserom'
};

