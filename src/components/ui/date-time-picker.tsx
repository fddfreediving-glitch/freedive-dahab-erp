import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, InputHTMLAttributes } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react';
import { createPortal } from 'react-dom';

type PickerType = 'date' | 'time' | 'datetime-local';

interface ErpDateTimePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value' | 'min' | 'max'> {
  type: PickerType;
  value?: string;
  min?: string;
  max?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}

const timeSlots = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? '00' : '30';
  const value = `${String(hour).padStart(2, '0')}:${minute}`;
  const displayHour = hour % 12 || 12;
  return { value, label: `${String(displayHour).padStart(2, '0')}:${minute} ${hour < 12 ? 'AM' : 'PM'}` };
});

function parseDate(value: string): Date | null {
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const [year, month, day] = datePart.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day ? parsed : null;
}

function localDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function ErpDateTimePicker({
  type,
  value = '',
  onChange,
  onClick,
  className = '',
  style,
  min,
  max,
  disabled,
  required,
  ...inputProps
}: ErpDateTimePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const initialDate = parseDate(value) ?? new Date();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(type === 'time' ? '' : (parseDate(value) ? localDateValue(initialDate) : ''));
  const [selectedTime, setSelectedTime] = useState(type === 'date' ? '' : (type === 'datetime-local' ? value.slice(11, 16) : value));
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const weekdays = useMemo(() => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], []);
  const days = useMemo(() => {
    const offset = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay();
    const monthLength = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    const cells = Math.ceil((offset + monthLength) / 7) * 7;
    return Array.from({ length: cells }, (_, index) => {
      const day = index - offset + 1;
      return day < 1 || day > monthLength ? null : new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
    });
  }, [visibleMonth]);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const getFocusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
    getFocusable()[0]?.focus();
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeys);
    return () => {
      document.removeEventListener('keydown', handleKeys);
      inputRef.current?.focus();
    };
  }, [isOpen]);

  const openPicker = () => {
    const current = parseDate(String(value));
    const nextDate = current ? localDateValue(current) : '';
    setSelectedDate(type === 'time' ? '' : nextDate);
    setSelectedTime(type === 'date' ? '' : type === 'datetime-local' ? String(value).slice(11, 16) : String(value));
    const month = current ?? new Date();
    setVisibleMonth(new Date(month.getFullYear(), month.getMonth(), 1));
    setIsOpen(true);
  };

  const isDateDisabled = (date: Date) => {
    const candidate = localDateValue(date);
    return Boolean((min && candidate < min.slice(0, 10)) || (max && candidate > max.slice(0, 10)));
  };

  const isTimeDisabled = (time: string) => {
    if (type === 'time') return Boolean((min && time < min) || (max && time > max));
    const candidate = `${selectedDate}T${time}`;
    return Boolean((selectedDate && min && candidate < min) || (selectedDate && max && candidate > max));
  };

  const saveValue = () => {
    if (!inputRef.current) return;
    const nextValue = type === 'date' ? selectedDate : type === 'time' ? selectedTime : `${selectedDate}T${selectedTime}`;
    if (!nextValue || (type === 'datetime-local' && (!selectedDate || !selectedTime))) return;
    inputRef.current.value = nextValue;
    onChange?.({
      target: inputRef.current,
      currentTarget: inputRef.current,
      nativeEvent: new Event('change', { bubbles: true }),
      bubbles: true,
      cancelable: false,
      defaultPrevented: false,
      eventPhase: 0,
      isTrusted: false,
      timeStamp: Date.now(),
      type: 'change',
      preventDefault: () => undefined,
      isDefaultPrevented: () => false,
      stopPropagation: () => undefined,
      isPropagationStopped: () => false,
      persist: () => undefined,
    } as unknown as ChangeEvent<HTMLInputElement>);
    setIsOpen(false);
  };

  const monthLabel = visibleMonth.toLocaleDateString('en', { month: 'long', year: 'numeric' });
  const dialogTitle = type === 'date' ? 'Choose a date' : type === 'time' ? 'Choose a time' : 'Schedule an appointment';

  return (
    <>
      <span className="relative flex w-full">
        <input
          {...inputProps}
          ref={inputRef}
          type={type}
          value={value}
          min={min}
          max={max}
          required={required}
          disabled={disabled}
          className={`erp-date-time-native ${className}`.trim()}
          style={{ ...style, paddingInlineEnd: '2.75rem' }}
          onClick={(event) => {
            onClick?.(event);
            if (!event.defaultPrevented && !disabled) {
              event.preventDefault();
              openPicker();
            }
          }}
          onChange={onChange}
        />
        <button
          type="button"
          aria-label={type === 'time' ? 'Open time picker' : 'Open date picker'}
          aria-controls="erp-date-time-modal"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          disabled={disabled}
          onClick={openPicker}
          className="absolute inset-y-0 right-1 inline-flex w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
        >
          {type === 'time' ? <Clock3 aria-hidden="true" className="h-4 w-4" /> : <CalendarDays aria-hidden="true" className="h-4 w-4" />}
        </button>
      </span>

      {isOpen && createPortal(<div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setIsOpen(false); }}
        >
          <section id="erp-date-time-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="erp-date-time-title" className="w-full max-w-[23rem] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h2 id="erp-date-time-title" className="font-semibold">{dialogTitle}</h2>
              <button type="button" aria-label="Close picker" onClick={() => setIsOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-slate-300 dark:hover:bg-slate-800">
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </header>

            <div className="max-h-[calc(100vh-7rem)] space-y-4 overflow-y-auto p-4">
              {type !== 'time' && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <button type="button" aria-label="Previous month" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-slate-800">
                      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <h3 aria-live="polite" className="text-sm font-semibold">{monthLabel}</h3>
                    <button type="button" aria-label="Next month" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-slate-800">
                      <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                  <div aria-label={`${monthLabel} calendar`} className="grid grid-cols-7 gap-1 text-center">
                    {weekdays.map((weekday) => <span key={weekday} aria-hidden="true" className="py-1 text-xs font-medium text-slate-500 dark:text-slate-400">{weekday}</span>)}
                    {days.map((day, index) => {
                      if (!day) return <span key={`empty-${index}`} aria-hidden="true" className="h-9" />;
                      const dateValue = localDateValue(day);
                      const selected = dateValue === selectedDate;
                      const unavailable = isDateDisabled(day);
                      return (
                        <button
                          key={dateValue}
                          type="button"
                          aria-label={day.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                          aria-pressed={selected}
                          disabled={unavailable}
                          onClick={() => setSelectedDate(dateValue)}
                          className={`h-9 rounded-lg text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${selected ? 'bg-blue-600 font-semibold text-white hover:bg-blue-700' : 'text-slate-700 hover:bg-blue-50 dark:text-slate-200 dark:hover:bg-slate-800'} disabled:cursor-not-allowed disabled:opacity-30`}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {type !== 'date' && (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Pick your time</legend>
                  <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto pr-1">
                    {timeSlots.map((slot) => {
                      const selected = selectedTime === slot.value;
                      return <button key={slot.value} type="button" aria-pressed={selected} disabled={isTimeDisabled(slot.value)} onClick={() => setSelectedTime(slot.value)} className={`min-h-10 rounded-lg border px-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${selected ? 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800' : 'border-slate-200 bg-white text-blue-800 hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-200 dark:hover:bg-slate-800'} disabled:cursor-not-allowed disabled:opacity-35`}>{slot.label}</button>;
                    })}
                  </div>
                </fieldset>
              )}

              <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                <button type="button" disabled={disabled || (type !== 'time' && !selectedDate) || (type !== 'date' && !selectedTime)} onClick={saveValue} className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Save</button>
                <button type="button" onClick={() => setIsOpen(false)} className="min-h-10 rounded-lg border border-slate-300 bg-slate-100 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">Discard</button>
              </div>
            </div>
          </section>
        </div>, document.body)}
    </>
  );
}
