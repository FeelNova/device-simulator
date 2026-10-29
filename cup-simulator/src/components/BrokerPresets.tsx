'use client';

const presets = [
  { label: 'Preprod', url: 'wss://fun.getpulsar.io/mqtt/' },
  { label: 'Test site', url: 'wss://www.feelnova-ai.com/mqtt/' },
];

export default function BrokerPresets({ value, disabled, onSelect }: {
  value: string; disabled: boolean; onSelect: (url: string) => void;
}) {
  return <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Broker quick selection">
    {presets.map(preset => <button key={preset.url} type="button" disabled={disabled}
      aria-pressed={value.replace(/\/$/, '') === preset.url.replace(/\/$/, '')}
      title={preset.url} onClick={() => onSelect(preset.url)}
      className={`rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${value.replace(/\/$/, '') === preset.url.replace(/\/$/, '') ? 'border-blue-400/60 bg-blue-500/20 text-blue-100' : 'border-white/15 text-white/70 hover:bg-white/10'}`}>
      {preset.label}
    </button>)}
  </div>;
}
