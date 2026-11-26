import { motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

type Props = { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void };

/** Compact accessible dropdown using the staggered open/close motion from the supplied reference. */
export function AnimatedStaggeredDropdown({ label, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value)?.label || label;
  return <div className="relative min-w-0">
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}
      className="erp-dropdown-primary-trigger flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
      <span className="truncate">{selected}</span><motion.span animate={{ rotate: open ? 180 : 0 }}><ChevronDown size={16} /></motion.span>
    </button>
    <motion.ul role="listbox" aria-label={label} initial={false} animate={open ? 'open' : 'closed'} style={{ originY: 0 }}
      variants={{ open: { opacity: 1, scaleY: 1, pointerEvents: 'auto' }, closed: { opacity: 0, scaleY: 0.92, pointerEvents: 'none' } }}
      className="erp-dropdown-menu absolute z-30 mt-1 max-h-56 w-full overflow-auto p-1">
      {options.map((option, index) => <motion.li key={option.value} role="option" aria-selected={value === option.value}
        initial={false} animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }} transition={{ delay: open ? index * 0.025 : 0 }}>
        <button type="button" onClick={() => { onChange(option.value); setOpen(false); }} className="erp-dropdown-item w-full px-3 py-2 text-left text-sm">{option.label}</button>
      </motion.li>)}
    </motion.ul>
  </div>;
}
