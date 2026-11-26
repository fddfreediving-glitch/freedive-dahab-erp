import { Children, Fragment, isValidElement, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

type SelectOption = { value: string; label: ReactNode; text: string; disabled: boolean; group?: string; tone?: string };
type SelectProps = {
  id?: string;
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (event: { target: { value: string }; currentTarget: { value: string } }) => void;
  children?: ReactNode;
  className?: string;
  displayValue?: ReactNode;
  menuWidth?: number | string;
  title?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

function textFromNode(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textFromNode(node.props.children);
  return '';
}

function readOptions(children: ReactNode, group?: string, groupDisabled = false): SelectOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string | number; label?: ReactNode; disabled?: boolean; children?: ReactNode; 'data-tone'?: string }>(child)) return [];
    if (child.type === Fragment) return readOptions(child.props.children, group, groupDisabled);
    if (child.type === 'optgroup') {
      const props = child.props as { label?: string; disabled?: boolean; children?: ReactNode };
      return readOptions(props.children, props.label, groupDisabled || Boolean(props.disabled));
    }
    if (child.type !== 'option') return [];
    const props = child.props;
    const text = textFromNode(props.label ?? props.children);
    return [{ value: String(props.value ?? text), label: props.label ?? props.children, text, disabled: groupDisabled || Boolean(props.disabled), ...(group ? { group } : {}), ...(props['data-tone'] ? { tone: props['data-tone'] } : {}) }];
  });
}

/** ERP-wide accessible dropdown; preserves the native select value/onChange contract and option groups. */
export function ErpSelect({
  id,
  name,
  value,
  defaultValue,
  onChange,
  children,
  className = '',
  displayValue,
  menuWidth,
  title,
  required,
  disabled,
  autoFocus,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: SelectProps) {
  const generatedId = useId();
  const listId = `${generatedId}-options`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [uncontrolledValue, setUncontrolledValue] = useState(String(defaultValue ?? ''));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchText, setSearchText] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const options = useMemo(() => readOptions(children), [children]);
  const selectedValue = value === undefined
    ? (defaultValue !== undefined || uncontrolledValue !== '' || options.some((option) => option.value === '')
      ? uncontrolledValue
      : options.find((option) => !option.disabled)?.value ?? '')
    : String(value);
  const selectedOption = options.find((option) => option.value === selectedValue);
  const accessibleLabel = ariaLabel || ariaLabelledBy || title || 'Choose an option';
  const selectedIndex = options.findIndex((option) => option.value === selectedValue && !option.disabled);

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportPadding = 8;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(100, Math.min(320, (openAbove ? spaceAbove : spaceBelow) - 4));
    const width = menuWidth ?? rect.width;
    const resolvedWidth = typeof width === 'number' ? width : Number.parseFloat(width);
    setMenuStyle({ position: 'fixed', left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - resolvedWidth - viewportPadding)), width, maxHeight, zIndex: 2000, ...(openAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }) });
  };

  const showMenu = (startIndex = selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled)) => {
    setActiveIndex(Math.max(0, startIndex));
    updatePosition();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !document.getElementById(listId)?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, listId]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    if (value === undefined) setUncontrolledValue(option.value);
    onChange?.({ target: { value: option.value }, currentTarget: { value: option.value } });
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveActive = (direction: 1 | -1) => {
    let index = activeIndex;
    for (let tries = 0; tries < options.length; tries += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index]?.disabled) { setActiveIndex(index); return; }
    }
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); open ? moveActive(1) : showMenu(selectedIndex); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); open ? moveActive(-1) : showMenu(selectedIndex); }
    else if (event.key === 'Home' && open) { event.preventDefault(); setActiveIndex(options.findIndex((option) => !option.disabled)); }
    else if (event.key === 'End' && open) {
      event.preventDefault();
      for (let index = options.length - 1; index >= 0; index -= 1) {
        if (!options[index].disabled) { setActiveIndex(index); break; }
      }
    }
    else if ((event.key === 'Enter' || event.key === ' ') && open) { event.preventDefault(); const option = options[activeIndex]; if (option) choose(option); }
    else if (!open && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); showMenu(); }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && options.length) {
      setSearchText((current) => current + event.key.toLowerCase());
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => setSearchText(''), 600);
      const query = (searchText + event.key).toLowerCase();
      const start = Math.max(-1, selectedIndex);
      const next = [...options.slice(start + 1), ...options.slice(0, start + 1)].findIndex((option) => !option.disabled && option.text.toLowerCase().startsWith(query));
      if (next >= 0) { const realIndex = (start + 1 + next) % options.length; if (open) setActiveIndex(realIndex); else choose(options[realIndex]); }
    }
  };

  const menu = open && typeof document !== 'undefined' ? createPortal(
    <div id={listId} role="listbox" aria-label={accessibleLabel} className="erp-dropdown-menu overflow-y-auto p-2" style={menuStyle}>
      {options.map((option, index) => {
        const showGroup = option.group && (index === 0 || options[index - 1]?.group !== option.group);
        return <div key={`${option.value}-${index}`}>
          {showGroup && <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{option.group}</div>}
          <div ref={(node) => { optionRefs.current[index] = node; }} id={`${listId}-option-${index}`} role="option" aria-selected={selectedValue === option.value} aria-disabled={option.disabled || undefined} onMouseEnter={() => !option.disabled && setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)} className={`erp-dropdown-item flex min-h-9 cursor-pointer items-center justify-between gap-2 px-2 text-sm ${option.tone === 'green' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : option.tone === 'blue' ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300' : ''} ${activeIndex === index ? 'ring-1 ring-inset ring-blue-200 dark:ring-blue-800' : ''} ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
            <span className="min-w-0 truncate">{option.label}</span>{selectedValue === option.value && <Check size={15} aria-hidden="true" />}
          </div>
        </div>;
      })}
      {options.length === 0 && <div className="px-2 py-3 text-xs text-slate-500">No options available</div>}
    </div>, document.body,
  ) : null;

  return <div ref={rootRef} className="relative min-w-0">
    {name && <input type="hidden" name={name} value={selectedValue} />}
    {required && <select aria-hidden="true" tabIndex={-1} required value={selectedValue} disabled={disabled} className="sr-only" onInvalid={(event) => { event.preventDefault(); triggerRef.current?.focus(); showMenu(); }}>{children}</select>}
    <button ref={triggerRef} id={id} type="button" title={title} autoFocus={autoFocus} disabled={disabled} className={`erp-dropdown-primary-trigger flex w-full min-w-0 items-center justify-between gap-2 text-left ${className}`} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} aria-describedby={ariaDescribedBy} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined} aria-required={required || undefined} onClick={() => open ? setOpen(false) : showMenu()} onKeyDown={onTriggerKeyDown}>
      <span className="min-w-0 flex-1 truncate">{displayValue ?? selectedOption?.label ?? (selectedValue === '' ? 'Choose…' : '')}</span><ChevronDown size={16} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    {menu}
  </div>;
}
